'use strict';
const crypto = require('crypto');
const { bad, AppError } = require('./errors');
const { audit } = require('./audit');
const { parse, can } = require('./permissions');
const settings = require('./settings');

const MAX_FAILED = 5;
const LOCK_MINUTES = 5;
const MIN_PASSWORD = 6;

// ---- password hashing (scrypt; built into Node, no native dependency) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function checkPasswordPolicy(pw, username) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw bad(`Password must be at least ${MIN_PASSWORD} characters.`, { password: true });
  if (username && pw.toLowerCase() === String(username).toLowerCase()) throw bad('Password cannot be the same as the username.', { password: true });
}
function checkUsername(u) {
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(String(u || ''))) {
    throw bad('Username must be 3-30 letters, numbers, dot, dash or underscore (no spaces).', { username: true });
  }
}

// ---- users ----
const publicUser = (u, perms) => ({
  id: u.id, username: u.username, displayName: u.display_name, role: u.role,
  isActive: !!u.is_active, mustChangePassword: !!u.must_change_password,
  lastLoginAt: u.last_login_at, createdAt: u.created_at, permissions: perms,
});
const permsFor = (db, role) => parse(db.get('SELECT permissions FROM roles WHERE name = ?', role)?.permissions);

const userCount = (db) => db.get('SELECT COUNT(*) n FROM users').n;
const needsSetup = (db) => userCount(db) === 0;

function setupAdmin(db, { businessName, displayName, username, password }) {
  if (!needsSetup(db)) throw new AppError('CONFLICT', 'Setup has already been completed.');
  checkUsername(username); checkPasswordPolicy(password, username);
  const dn = String(displayName || '').trim();
  if (!dn) throw bad('Your name is required.', { displayName: true });
  db.tx(() => {
    if (businessName && String(businessName).trim()) settings.update(db, { business_name: businessName });
    const id = db.run('INSERT INTO users(username,display_name,role,password_hash) VALUES (?,?,?,?)',
      username, dn, 'admin', hashPassword(password)).lastInsertRowid;
    audit(db, { id, username }, 'setup.admin_created', 'user', id);
  });
}

// ---- sessions (memory only: closing the app signs everyone out) ----
class Sessions {
  constructor(db) { this.db = db; this.map = new Map(); this.now = () => Date.now(); }
  idleMs() { return Number(settings.get(this.db, 'session_idle_minutes', '60')) * 60000; }

  login(username, password) {
    const u = this.db.get('SELECT * FROM users WHERE username = ?', String(username || '').trim());
    const generic = new AppError('AUTH_FAILED', 'Wrong username or password.');
    if (!u || !u.is_active) { audit(this.db, null, 'login.failed', 'user', null, { username }); throw generic; }
    if (u.locked_until && new Date(u.locked_until).getTime() > this.now()) {
      const mins = Math.ceil((new Date(u.locked_until).getTime() - this.now()) / 60000);
      throw new AppError('LOCKED', `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    if (!verifyPassword(String(password ?? ''), u.password_hash)) {
      const n = u.failed_attempts + 1;
      if (n >= MAX_FAILED) {
        this.db.run('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?',
          new Date(this.now() + LOCK_MINUTES * 60000).toISOString(), u.id);
        audit(this.db, u, 'login.locked', 'user', u.id);
      } else {
        this.db.run('UPDATE users SET failed_attempts = ? WHERE id = ?', n, u.id);
      }
      audit(this.db, u, 'login.failed', 'user', u.id);
      throw generic;
    }
    this.db.run(`UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, u.id);
    const token = crypto.randomBytes(32).toString('hex');
    this.map.set(token, { userId: u.id, lastSeen: this.now() });
    audit(this.db, u, 'login.success', 'user', u.id);
    return { token, user: this.userById(u.id) };
  }

  userById(id) {
    const u = this.db.get('SELECT * FROM users WHERE id = ?', id);
    return u ? publicUser(u, permsFor(this.db, u.role)) : null;
  }

  /** Validate a token; refreshes idle timer. Re-reads the user so deactivation/role changes apply instantly. */
  resolve(token) {
    const s = token && this.map.get(token);
    if (!s) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    if (this.now() - s.lastSeen > this.idleMs()) {
      this.map.delete(token);
      throw new AppError('SESSION_EXPIRED', 'You were signed out after a period of inactivity.');
    }
    const user = this.userById(s.userId);
    if (!user || !user.isActive) { this.map.delete(token); throw new AppError('UNAUTHENTICATED', 'Please sign in.'); }
    s.lastSeen = this.now();
    return user;
  }

  logout(token) {
    const s = this.map.get(token);
    if (s) { audit(this.db, this.userById(s.userId), 'logout', 'user', s.userId); this.map.delete(token); }
  }
  dropUser(userId) { for (const [t, s] of this.map) if (s.userId === userId) this.map.delete(t); }
}

// ---- user management ----
function listUsers(db) {
  return db.all('SELECT * FROM users ORDER BY username').map((u) => publicUser(u, permsFor(db, u.role)));
}
function activeAdmins(db) {
  return db.get(`SELECT COUNT(*) n FROM users WHERE role='admin' AND is_active=1`).n;
}
function createUser(db, actor, { username, displayName, role, password }) {
  checkUsername(username); checkPasswordPolicy(password, username);
  if (!String(displayName || '').trim()) throw bad('Name is required.', { displayName: true });
  if (!db.get('SELECT 1 x FROM roles WHERE name = ?', role)) throw bad('Choose a valid role.', { role: true });
  if (db.get('SELECT 1 x FROM users WHERE username = ?', username)) throw bad('That username is already taken.', { username: true });
  return db.tx(() => {
    const id = db.run('INSERT INTO users(username,display_name,role,password_hash,must_change_password) VALUES (?,?,?,?,1)',
      username, String(displayName).trim(), role, hashPassword(password)).lastInsertRowid;
    audit(db, actor, 'user.created', 'user', id, { username, role });
    return id;
  });
}
function updateUser(db, sessions, actor, id, { displayName, role, isActive }) {
  const u = db.get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw bad('User not found.');
  const nextRole = role ?? u.role;
  const nextActive = isActive == null ? !!u.is_active : !!isActive;
  if (!db.get('SELECT 1 x FROM roles WHERE name = ?', nextRole)) throw bad('Choose a valid role.');
  const losesAdmin = u.role === 'admin' && u.is_active && (nextRole !== 'admin' || !nextActive);
  if (losesAdmin && activeAdmins(db) <= 1) throw bad('There must always be at least one active administrator.');
  if (actor.id === id && !nextActive) throw bad('You cannot deactivate your own account.');
  db.tx(() => {
    db.run(`UPDATE users SET display_name=?, role=?, is_active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
      String(displayName ?? u.display_name).trim() || u.display_name, nextRole, nextActive ? 1 : 0, id);
    audit(db, actor, 'user.updated', 'user', id, { role: nextRole, isActive: nextActive });
  });
  if (!nextActive || nextRole !== u.role) sessions.dropUser(id);
}
function resetPassword(db, sessions, actor, id, newPassword) {
  const u = db.get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw bad('User not found.');
  checkPasswordPolicy(newPassword, u.username);
  db.tx(() => {
    db.run(`UPDATE users SET password_hash=?, must_change_password=?, failed_attempts=0, locked_until=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
      hashPassword(newPassword), actor.id === id ? 0 : 1, id);
    audit(db, actor, 'user.password_reset', 'user', id);
  });
  if (actor.id !== id) sessions.dropUser(id);
}
function changeOwnPassword(db, actor, currentPassword, newPassword) {
  const u = db.get('SELECT * FROM users WHERE id = ?', actor.id);
  if (!verifyPassword(String(currentPassword ?? ''), u.password_hash)) throw bad('Your current password is not correct.', { currentPassword: true });
  checkPasswordPolicy(newPassword, u.username);
  if (verifyPassword(newPassword, u.password_hash)) throw bad('Choose a password different from the current one.', { password: true });
  db.tx(() => {
    db.run(`UPDATE users SET password_hash=?, must_change_password=0, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
      hashPassword(newPassword), actor.id);
    audit(db, actor, 'user.password_changed', 'user', actor.id);
  });
}

module.exports = {
  hashPassword, verifyPassword, needsSetup, setupAdmin, Sessions,
  listUsers, createUser, updateUser, resetPassword, changeOwnPassword, can, MAX_FAILED, LOCK_MINUTES,
};

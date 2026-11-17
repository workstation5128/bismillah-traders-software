'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { newApp, adminApp } = require('./helpers');
const auth = require('../src/core/auth');

test('password hashes are salted and verify correctly', () => {
  const a = auth.hashPassword('secret123'), b = auth.hashPassword('secret123');
  assert.notEqual(a, b);
  assert.ok(auth.verifyPassword('secret123', a));
  assert.ok(!auth.verifyPassword('secret124', a));
  assert.ok(!auth.verifyPassword('x', 'garbage'));
  assert.ok(!a.includes('secret123'));
});

test('first-run setup works once, enforces password rules, and signs in', async () => {
  const app = newApp();
  assert.equal((await app.invoke('auth.status')).data.needsSetup, true);
  const weak = await app.invoke('auth.setup', { displayName: 'Owner', username: 'owner', password: '123' });
  assert.equal(weak.ok, false); assert.equal(weak.error.code, 'VALIDATION');
  const badName = await app.invoke('auth.setup', { displayName: 'Owner', username: 'o w', password: 'secret123' });
  assert.equal(badName.ok, false);
  const ok = await app.invoke('auth.setup', { businessName: 'Bismillah Traders', displayName: 'Owner', username: 'owner', password: 'secret123' });
  assert.equal(ok.ok, true); assert.equal(ok.data.user.role, 'admin'); assert.ok(ok.data.token);
  assert.equal((await app.invoke('auth.status')).data.needsSetup, false);
  const again = await app.invoke('auth.setup', { displayName: 'Evil', username: 'evil', password: 'secret123' });
  assert.equal(again.ok, false); assert.equal(again.error.code, 'CONFLICT');
  assert.equal(app.db.get('SELECT COUNT(*) n FROM users').n, 1);
});

test('no default credentials exist on a fresh install', async () => {
  const app = newApp();
  for (const u of ['admin', 'owner', 'cashier', '']) assert.equal((await app.invoke('auth.login', { username: u, password: 'admin' })).ok, false);
});

test('wrong passwords lock the account for 5 minutes, then it recovers', async () => {
  const { app } = await adminApp();
  for (let i = 0; i < 4; i++) { const r = await app.invoke('auth.login', { username: 'owner', password: 'nope' }); assert.equal(r.error.code, 'AUTH_FAILED'); }
  const fifth = await app.invoke('auth.login', { username: 'owner', password: 'nope' });
  assert.equal(fifth.error.code, 'AUTH_FAILED');
  const locked = await app.invoke('auth.login', { username: 'owner', password: 'secret123' }); // even correct password refused
  assert.equal(locked.error.code, 'LOCKED'); assert.match(locked.error.message, /5 minutes/);
  app.sessions.now = () => Date.now() + 6 * 60000;
  const ok = await app.invoke('auth.login', { username: 'owner', password: 'secret123' });
  assert.equal(ok.ok, true);
});

test('login error does not reveal whether the username exists', async () => {
  const { app } = await adminApp();
  const a = await app.invoke('auth.login', { username: 'owner', password: 'wrong1' });
  const b = await app.invoke('auth.login', { username: 'ghost', password: 'wrong1' });
  assert.equal(a.error.message, b.error.message);
});

test('sessions: required, idle-expiry, logout', async () => {
  const { app, token } = await adminApp();
  assert.equal((await app.invoke('auth.me')).error.code, 'UNAUTHENTICATED');
  assert.equal((await app.invoke('auth.me', {}, 'forged-token')).error.code, 'UNAUTHENTICATED');
  assert.equal((await app.invoke('auth.me', {}, token)).ok, true);
  await app.invoke('settings.update', { session_idle_minutes: 5 }, token);
  const t0 = Date.now(); app.sessions.now = () => t0 + 6 * 60000;
  assert.equal((await app.invoke('auth.me', {}, token)).error.code, 'SESSION_EXPIRED');
  app.sessions.now = () => Date.now();
  const again = (await app.invoke('auth.login', { username: 'owner', password: 'secret123' })).data.token;
  await app.invoke('auth.logout', {}, again);
  assert.equal((await app.invoke('auth.me', {}, again)).error.code, 'UNAUTHENTICATED');
});

test('cashier role is limited; admin can manage users', async () => {
  const { app, call } = await adminApp();
  const created = await call('users.create', { username: 'ali', displayName: 'Ali', role: 'cashier', password: 'temp1234' });
  assert.equal(created.ok, true);
  const login = await app.invoke('auth.login', { username: 'ali', password: 'temp1234' });
  assert.equal(login.ok, true);
  assert.equal(login.data.user.mustChangePassword, true);
  const t = login.data.token;
  // must change password before anything else
  assert.equal((await app.invoke('dashboard.summary', {}, t)).error.code, 'MUST_CHANGE_PASSWORD');
  assert.equal((await app.invoke('settings.get', {}, t)).ok, true);        // the shell needs this to draw the password prompt
  assert.equal((await app.invoke('settings.update', { business_name: 'x' }, t)).ok, false);
  assert.equal((await app.invoke('backup.list', {}, t)).error.code, 'MUST_CHANGE_PASSWORD');
  assert.equal((await app.invoke('auth.changePassword', { currentPassword: 'temp1234', newPassword: 'ali-new-pass' }, t)).ok, true);
  assert.equal((await app.invoke('dashboard.summary', {}, t)).ok, true);
  for (const ch of ['users.list', 'audit.list', 'settings.update', 'backup.create', 'system.integrityCheck']) {
    const r = await app.invoke(ch, {}, t);
    assert.equal(r.error.code, 'FORBIDDEN', ch);
  }
  assert.equal((await app.invoke('settings.get', {}, t)).ok, true);   // read-only business info is fine
});

test('cannot remove the last administrator or deactivate yourself', async () => {
  const { app, call } = await adminApp();
  const me = (await call('auth.me')).data;
  assert.match((await call('users.update', { id: me.id, role: 'cashier' })).error.message, /at least one active administrator/);
  assert.match((await call('users.update', { id: me.id, isActive: false })).error.message, /at least one active administrator|own account/);
  const id = (await call('users.create', { username: 'boss2', displayName: 'Boss 2', role: 'admin', password: 'secret456' })).data.id;
  assert.equal((await call('users.update', { id, role: 'cashier' })).ok, true);   // fine: owner remains
  assert.match((await call('users.update', { id: me.id, isActive: false })).error.message, /own account|administrator/);
});

test('deactivating or resetting a user kills their live session', async () => {
  const { app, call } = await adminApp();
  const id = (await call('users.create', { username: 'sam', displayName: 'Sam', role: 'cashier', password: 'secret456' })).data.id;
  const t = (await app.invoke('auth.login', { username: 'sam', password: 'secret456' })).data.token;
  assert.equal((await call('users.update', { id, isActive: false })).ok, true);
  assert.equal((await app.invoke('auth.me', {}, t)).ok, false);
  assert.equal((await app.invoke('auth.login', { username: 'sam', password: 'secret456' })).ok, false);
});

test('activity log records actions and is append-only', async () => {
  const { app, call } = await adminApp();
  await call('settings.update', { business_phone: '03000000000' });
  await app.invoke('auth.login', { username: 'owner', password: 'bad-pass' });
  const log = (await call('audit.list', {})).data;
  const actions = log.rows.map((r) => r.action);
  for (const a of ['setup.admin_created', 'login.success', 'settings.updated', 'login.failed']) assert.ok(actions.includes(a), a);
  assert.throws(() => app.db.run('UPDATE audit_log SET action = ? WHERE id = ?', 'x', log.rows[0].id), /append-only/);
  assert.throws(() => app.db.run('DELETE FROM audit_log'), /append-only/);
  assert.ok(!JSON.stringify(log).includes('secret123'), 'passwords never reach the log');
});

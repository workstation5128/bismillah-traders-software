'use strict';
/**
 * The app's entire back-end API. Electron's main process and the dev/test server both call invoke().
 * The renderer never touches the database directly.
 *
 * Every channel declares who may call it:
 *   auth: false         -> public (login screens)
 *   perm: undefined     -> any signed-in user
 *   perm: 'users.manage'-> signed-in user whose role has that permission
 */
const path = require('path');
const { openDatabase } = require('../core/db');
const { migrate } = require('../core/migrate');
const migrations = require('../core/migrations');
const settings = require('../core/settings');
const authLib = require('../core/auth');
const { audit, logError, listAudit } = require('../core/audit');
const { AppError, bad, denied } = require('../core/errors');
const { PERMISSIONS } = require('../core/permissions');
const system = require('../core/system');
const backup = require('../core/backup');

const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ''));
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function createApp({ dataDir, version = '0.0.0' }) {
  const dirs = { dataDir, backupDir: path.join(dataDir, 'backups'), logDir: path.join(dataDir, 'logs') };
  const db = openDatabase(path.join(dataDir, 'data', 'bt-pos.db'));
  const migration = migrate(db, migrations, { backupDir: dirs.backupDir });
  settings.seedSettings(db);
  const sessions = new authLib.Sessions(db);

  const businessInfo = () => {
    const s = settings.getAll(db);
    return { name: s.business_name, tagline: s.business_tagline, address: s.business_address, phone: s.business_phone };
  };

  const H = {
    // ---------- public ----------
    'auth.status': { auth: false, fn: () => ({ needsSetup: authLib.needsSetup(db), business: businessInfo(), version }) },
    'auth.setup': { auth: false, fn: (_c, p) => {
      authLib.setupAdmin(db, p);
      return sessions.login(p.username, p.password);
    } },
    'auth.login': { auth: false, fn: (_c, p) => sessions.login(p?.username, p?.password) },

    // ---------- any signed-in user ----------
    'auth.logout': { fn: (c) => { sessions.logout(c.token); return true; } },
    'auth.me': { fn: (c) => c.user },
    'auth.changePassword': { fn: (c, p) => { authLib.changeOwnPassword(db, c.user, p?.currentPassword, p?.newPassword); return true; } },
    'settings.get': { fn: () => settings.getAll(db) },
    'system.health': { fn: () => system.health(db, { ...dirs, version }) },

    // ---------- permissioned ----------
    'settings.update': { perm: 'settings.manage', fn: (c, p) => {
      const changed = settings.update(db, p);
      audit(db, c.user, 'settings.updated', 'settings', null, changed);
      return settings.getAll(db);
    } },
    'users.list': { perm: 'users.manage', fn: () => ({ users: authLib.listUsers(db), permissionGroups: PERMISSIONS,
      roles: db.all('SELECT name, label FROM roles ORDER BY name') }) },
    'users.create': { perm: 'users.manage', fn: (c, p) => ({ id: authLib.createUser(db, c.user, p) }) },
    'users.update': { perm: 'users.manage', fn: (c, p) => { authLib.updateUser(db, sessions, c.user, Number(p?.id), p); return true; } },
    'users.resetPassword': { perm: 'users.manage', fn: (c, p) => { authLib.resetPassword(db, sessions, c.user, Number(p?.id), p?.newPassword); return true; } },
    'audit.list': { perm: 'audit.view', fn: (_c, p) => listAudit(db, p || {}) },
    'backup.list': { perm: 'backup.manage', fn: () => ({ backups: backup.listBackups(dirs.backupDir), backupDir: dirs.backupDir }) },
    'backup.create': { perm: 'backup.manage', fn: (c) => {
      const b = backup.createManualBackup(db, dirs.backupDir);
      audit(db, c.user, 'backup.manual', 'database', null, { file: path.basename(b.file), size: b.size });
      return b;
    } },
    'system.integrityCheck': { perm: 'backup.manage', fn: (c) => system.integrityCheck(db, c.user) },

    'dashboard.summary': { perm: 'dashboard.view', fn: (_c, p) => {
      const mode = p?.mode === 'month' ? 'month' : 'day';
      const value = p?.value || (mode === 'month' ? today().slice(0, 7) : today());
      if (mode === 'day' && !isoDate(value)) throw bad('Pick a valid date.');
      if (mode === 'month' && !isMonth(value)) throw bad('Pick a valid month.');
      // Stage 1: sales/purchases/stock tables do not exist yet, so nothing is invented.
      // Each metric becomes a real number when its module is built (see "feeds").
      const metrics = {
        sales: null, bills: null, cashReceived: null, udhaar: null, customerOutstanding: null,
        purchases: null, supplierPayable: null, grossProfit: null, expenses: null, netProfit: null,
        stockValue: null, bankBalance: null, emptyBottles: null, emptyCrates: null,
      };
      return { period: { mode, value }, live: false, metrics, lowStock: [], recentBills: [] };
    } },
  };

  /** Single entry point. Returns { ok, data } or { ok:false, error }. Never throws. */
  async function invoke(channel, payload, token) {
    const h = typeof channel === 'string' && Object.hasOwn(H, channel) ? H[channel] : null;
    if (!h) return { ok: false, error: { code: 'NO_SUCH_CHANNEL', message: 'Unknown request.' } };
    try {
      const ctx = { token, user: null };
      if (h.auth !== false) {
        ctx.user = sessions.resolve(token);
        // While a temporary password is pending, only these (own-account + read-only) calls work.
        const ownPw = ['auth.me', 'auth.changePassword', 'auth.logout', 'settings.get', 'system.health'];
        if (ctx.user.mustChangePassword && !ownPw.includes(channel)) {
          throw new AppError('MUST_CHANGE_PASSWORD', 'Please set a new password before continuing.');
        }
        if (h.perm && !authLib.can(ctx.user.permissions, h.perm)) throw denied();
      }
      if (payload != null && typeof payload !== 'object') throw bad('Invalid request.');
      return { ok: true, data: await h.fn(ctx, payload || {}) };
    } catch (err) {
      if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message, fields: err.fields } };
      const text = String(err?.message || err);
      // SQLite constraint failures from our own triggers are meaningful to show
      if (/immutable|append-only/.test(text)) return { ok: false, error: { code: 'IMMUTABLE', message: text } };
      logError(db, 'ipc:' + channel, err, { channel });
      return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. The problem was recorded in the error log; your data was not changed.' } };
    }
  }

  return { invoke, db, sessions, dirs, migration, close: () => db.close(), channels: Object.keys(H) };
}

module.exports = { createApp };

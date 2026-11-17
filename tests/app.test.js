'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { newApp, adminApp } = require('./helpers');
const J = require('../src/core/journal');

test('settings: only whitelisted, validated keys can change', async () => {
  const { call } = await adminApp();
  assert.equal((await call('settings.update', { business_name: 'Bismillah Traders Goraya' })).ok, true);
  assert.equal((await call('settings.get')).data.business_name, 'Bismillah Traders Goraya');
  assert.equal((await call('settings.update', { database_id: 'x' })).ok, false);
  assert.equal((await call('settings.update', { business_name: '  ' })).ok, false);
  assert.equal((await call('settings.update', { receipt_width: '99' })).ok, false);
  assert.equal((await call('settings.update', { session_idle_minutes: 0 })).ok, false);
  assert.equal((await call('settings.update', { receipt_width: '58', date_format: 'YYYY-MM-DD' })).ok, true);
});

test('business details default to the real Bismillah Traders profile', async () => {
  const { call } = await adminApp();
  const s = (await call('settings.get')).data;
  assert.equal(s.business_name, 'Bismillah Traders');
  assert.equal(s.business_phone, '03421224370');
  assert.match(s.business_address, /Amian Abad Road, Mundakey Goraya/);
  assert.equal(s.currency_symbol, 'Rs.');
  assert.ok(s.database_id.length > 20);
});

test('a fresh install contains no sample business records', async () => {
  const { app } = await adminApp();
  const none = ['journal_entries', 'journal_lines'];
  for (const t of none) assert.equal(app.db.get(`SELECT COUNT(*) n FROM ${t}`).n, 0, t);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM users').n, 1);
});

test('dashboard reports "not live" rather than inventing numbers', async () => {
  const { call } = await adminApp();
  const d = (await call('dashboard.summary', { mode: 'day', value: '2026-11-15' })).data;
  assert.equal(d.live, false);
  for (const v of Object.values(d.metrics)) assert.equal(v, null);
  assert.equal((await call('dashboard.summary', { mode: 'day', value: 'nonsense' })).ok, false);
  assert.equal((await call('dashboard.summary', { mode: 'month', value: '2026-11' })).ok, true);
});

test('data survives closing and reopening the app (persistence)', async () => {
  const { app, dir, call } = await adminApp();
  await call('settings.update', { business_tagline: 'Wholesale & Retail' });
  J.postEntry(app.db, { date: '2026-11-15', description: 'persist me', lines: [{ account: '1000', debit: 500 }, { account: '3000', credit: 500 }] });
  app.close();
  const again = newApp(dir);
  assert.deepEqual(again.migration.applied, []);
  assert.equal(again.db.get(`SELECT value FROM settings WHERE key='business_tagline'`).value, 'Wholesale & Retail');
  assert.equal(again.db.get('SELECT COUNT(*) n FROM journal_entries').n, 1);
  assert.equal(again.db.get('SELECT COUNT(*) n FROM users').n, 1);
  const r = await again.invoke('auth.login', { username: 'owner', password: 'secret123' });
  assert.equal(r.ok, true);
  again.close();
});

test('manual backup is a complete, openable copy; integrity check passes', async () => {
  const { app, call } = await adminApp();
  J.postEntry(app.db, { date: '2026-11-15', description: 'in backup', lines: [{ account: '1000', debit: 900 }, { account: '3000', credit: 900 }] });
  const b = (await call('backup.create')).data;
  assert.ok(fs.existsSync(b.file) && b.size > 0);
  const { openDatabase } = require('../src/core/db');
  const copy = openDatabase(b.file);
  assert.equal(copy.get('SELECT COUNT(*) n FROM journal_entries').n, 1);
  assert.equal(copy.get('SELECT COUNT(*) n FROM users').n, 1);
  copy.close();
  const list = (await call('backup.list')).data.backups;
  assert.equal(list.length, 1); assert.equal(list[0].kind, 'manual');
  const chk = (await call('system.integrityCheck')).data;
  assert.equal(chk.ok, true); assert.equal(chk.journalBalanced, true);
  const h = (await call('system.health')).data;
  assert.equal(h.integrityOk, true); assert.equal(h.schemaVersion, 1); assert.ok(h.lastBackupAt);
});

test('unexpected errors are logged and not leaked to the user', async () => {
  const { app, call } = await adminApp();
  app.db.exec('DROP TABLE doc_sequences');           // simulate corruption
  const r = await call('backup.list');                // unrelated call still fine
  assert.equal(r.ok, true);
  const bad = await call('settings.update', { receipt_width: '58' });
  assert.equal(bad.ok, true);
  app.db.exec('ALTER TABLE settings RENAME TO settings_x');
  const boom = await call('settings.get');
  assert.equal(boom.ok, false); assert.equal(boom.error.code, 'INTERNAL');
  assert.ok(!/settings_x|no such table/.test(boom.error.message), 'no internals leaked');
  assert.ok(app.db.get('SELECT COUNT(*) n FROM error_log').n >= 1);
});

test('unknown channels are rejected', async () => {
  const { app, token } = await adminApp();
  assert.equal((await app.invoke('fs.readFile', { path: '/etc/passwd' }, token)).error.code, 'NO_SUCH_CHANNEL');
  assert.equal((await app.invoke('__proto__', {}, token)).error.code, 'NO_SUCH_CHANNEL');
  assert.equal((await app.invoke('constructor', {}, token)).error.code, 'NO_SUCH_CHANNEL');
});

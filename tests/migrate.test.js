'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { tmp } = require('./helpers');
const { openDatabase } = require('../src/core/db');
const { migrate, MigrationError } = require('../src/core/migrate');
const real = require('../src/core/migrations');

const open = () => { const d = tmp(); return { d, db: openDatabase(path.join(d, 'x.db')), backupDir: path.join(d, 'backups') }; };

test('fresh database gets the full schema and no backup', () => {
  const { db, backupDir } = open();
  const r = migrate(db, real, { backupDir });
  assert.deepEqual(r.applied, [1]); assert.equal(r.backup, null);
  const tables = db.all(`SELECT name FROM sqlite_master WHERE type='table'`).map((t) => t.name);
  for (const t of ['users', 'roles', 'settings', 'audit_log', 'journal_entries', 'journal_lines', 'accounts', 'doc_sequences']) assert.ok(tables.includes(t), t);
  assert.equal(db.pragma('foreign_keys')[0].foreign_keys, 1);
  assert.equal(Object.values(db.pragma('journal_mode')[0])[0], 'wal');
  assert.equal(db.pragma('synchronous')[0].synchronous, 2); // FULL
  db.close();
});

test('re-running is a no-op', () => {
  const { db, backupDir } = open();
  migrate(db, real, { backupDir });
  const r = migrate(db, real, { backupDir });
  assert.deepEqual(r.applied, []);
  db.close();
});

test('upgrade of existing data takes a safety backup and keeps all rows', () => {
  const { db, backupDir } = open();
  migrate(db, real, { backupDir });
  db.run(`INSERT INTO settings(key,value) VALUES ('keep_me','yes')`);
  const v2 = { version: 2, name: 'add_notes', sql: 'CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);' };
  const r = migrate(db, [...real, v2], { backupDir });
  assert.deepEqual(r.applied, [2]);
  assert.ok(r.backup && fs.existsSync(r.backup.file), 'backup file exists');
  assert.match(path.basename(r.backup.file), /before-migration-v2/);
  assert.equal(db.get(`SELECT value FROM settings WHERE key='keep_me'`).value, 'yes');
  // the backup is a real, openable DB that does NOT yet have the new table
  const copy = openDatabase(r.backup.file);
  assert.equal(copy.get(`SELECT value FROM settings WHERE key='keep_me'`).value, 'yes');
  assert.equal(copy.all(`SELECT name FROM sqlite_master WHERE name='notes'`).length, 0);
  copy.close(); db.close();
});

test('a failing migration rolls back completely and reports the backup', () => {
  const { db, backupDir } = open();
  migrate(db, real, { backupDir });
  const broken = { version: 2, name: 'broken', sql: 'CREATE TABLE half_done(id INTEGER); INSERT INTO nonexistent VALUES (1);' };
  assert.throws(() => migrate(db, [...real, broken], { backupDir }), (e) => e instanceof MigrationError && e.code === 'MIGRATION_FAILED' && /backup was saved/.test(e.message));
  assert.equal(db.all(`SELECT name FROM sqlite_master WHERE name='half_done'`).length, 0, 'partial table was rolled back');
  assert.equal(db.get('SELECT MAX(version) v FROM schema_migrations').v, 1);
  db.close();
});

test('data from a NEWER app version is refused untouched', () => {
  const { db, backupDir } = open();
  migrate(db, [...real, { version: 2, name: 'future', sql: 'SELECT 1;' }], { backupDir });
  assert.throws(() => migrate(db, real, { backupDir }), (e) => e.code === 'DB_NEWER_THAN_APP');
  db.close();
});

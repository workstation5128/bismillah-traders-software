'use strict';
/**
 * Database adapter. One tiny interface over two SQLite drivers:
 *   - better-sqlite3 : used by the real Electron app
 *   - node:sqlite    : used for tests/dev where better-sqlite3 is not installed
 * Both are the same SQLite engine, so SQL behaves identically.
 *
 * Money = integer paise, stock = integer single units. See money.js.
 */
const fs = require('fs');
const path = require('path');

function loadDriver() {
  const want = process.env.BT_SQLITE_DRIVER; // 'better' | 'node'
  if (want !== 'node') {
    try {
      const Better = require('better-sqlite3');
      return { name: 'better-sqlite3', open: (f) => new Better(f) };
    } catch (e) {
      if (want === 'better') throw e;
    }
  }
  const { DatabaseSync } = require('node:sqlite');
  return { name: 'node:sqlite', open: (f) => new DatabaseSync(f) };
}

class Db {
  constructor(file) {
    this.file = file;
    this.driver = loadDriver();
    this.raw = this.driver.open(file);
    this._depth = 0;
    this._stmts = new Map();
    this.exec('PRAGMA journal_mode = WAL');
    this.exec('PRAGMA foreign_keys = ON');
    this.exec('PRAGMA synchronous = FULL'); // shops have power cuts: favour durability over speed
    this.exec('PRAGMA busy_timeout = 5000');
  }

  exec(sql) { this.raw.exec(sql); }

  prepare(sql) {
    let s = this._stmts.get(sql);
    if (!s) {
      const st = this.raw.prepare(sql);
      s = {
        run: (...p) => {
          const r = st.run(...p);
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        },
        get: (...p) => { const r = st.get(...p); return r ? { ...r } : undefined; },
        all: (...p) => st.all(...p).map((r) => ({ ...r })),
      };
      this._stmts.set(sql, s);
    }
    return s;
  }

  run(sql, ...p) { return this.prepare(sql).run(...p); }
  get(sql, ...p) { return this.prepare(sql).get(...p); }
  all(sql, ...p) { return this.prepare(sql).all(...p); }
  pragma(text) { return this.all(`PRAGMA ${text}`); }

  /**
   * Run fn inside a transaction. Nested calls use SAVEPOINTs.
   * Everything commits together or rolls back together. fn must be synchronous.
   */
  tx(fn) {
    const nested = this._depth > 0;
    const sp = `sp_${this._depth}`;
    this.exec(nested ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
    this._depth++;
    try {
      const out = fn();
      this._depth--;
      this.exec(nested ? `RELEASE ${sp}` : 'COMMIT');
      return out;
    } catch (err) {
      this._depth--;
      try { this.exec(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK'); } catch (_) { /* already rolled back */ }
      throw err;
    }
  }

  /** Consistent single-file copy of the live database (safe while the app is running). */
  backupTo(destFile) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    if (fs.existsSync(destFile)) throw new Error('Backup target already exists: ' + destFile);
    this.run('VACUUM INTO ?', destFile);
    return destFile;
  }

  close() {
    try { this.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }
    this._stmts.clear();
    this.raw.close();
  }
}

function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return new Db(file);
}

module.exports = { openDatabase, Db };

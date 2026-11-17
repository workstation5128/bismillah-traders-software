'use strict';
const crypto = require('crypto');
const { createSafetyBackup } = require('./backup');

const checksum = (m) => crypto.createHash('sha256').update(m.sql || String(m.up)).digest('hex');

class MigrationError extends Error {
  constructor(message, code) { super(message); this.name = 'MigrationError'; this.code = code; }
}

/**
 * Bring the database to the latest schema.
 *  - Refuses to open data created by a NEWER app version (prevents silent damage).
 *  - Takes a full safety backup first when upgrading a database that already has data.
 *  - Each migration is atomic: on failure the database stays exactly as it was.
 */
function migrate(db, migrations, { backupDir } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);

  const applied = db.all('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
  const latestKnown = Math.max(0, ...migrations.map((m) => m.version));
  const latestApplied = applied.length ? applied[applied.length - 1].version : 0;

  if (latestApplied > latestKnown) {
    throw new MigrationError(
      `This data was created by a newer version of Bismillah Traders POS (schema ${latestApplied}). ` +
      `This copy only understands schema ${latestKnown}. Install the latest version; your data has not been touched.`,
      'DB_NEWER_THAN_APP');
  }

  const warnings = [];
  for (const a of applied) {
    const known = migrations.find((m) => m.version === a.version);
    if (known && checksum(known) !== a.checksum) {
      warnings.push(`Migration ${a.version} (${a.name}) differs from what was originally applied.`);
    }
  }

  const done = new Set(applied.map((a) => a.version));
  const pending = migrations.filter((m) => !done.has(m.version)).sort((a, b) => a.version - b.version);
  if (!pending.length) return { applied: [], backup: null, version: latestApplied, warnings };

  let backup = null;
  if (applied.length > 0) {
    if (!backupDir) throw new MigrationError('A backup folder is required to upgrade existing data.', 'NO_BACKUP_DIR');
    backup = createSafetyBackup(db, backupDir, `before-migration-v${pending[0].version}`);
  }

  const ran = [];
  for (const m of pending) {
    try {
      db.tx(() => {
        if (m.sql) db.exec(m.sql); else m.up(db);
        db.run('INSERT INTO schema_migrations(version,name,checksum) VALUES (?,?,?)', m.version, m.name, checksum(m));
      });
      ran.push(m.version);
    } catch (err) {
      throw new MigrationError(
        `Upgrade ${m.version} (${m.name}) failed and was rolled back: ${err.message}. ` +
        (backup ? `A backup was saved at ${backup.file}.` : ''), 'MIGRATION_FAILED');
    }
  }
  return { applied: ran, backup, version: ran[ran.length - 1], warnings };
}

module.exports = { migrate, MigrationError, checksum };

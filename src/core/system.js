'use strict';
const fs = require('fs');
const { listBackups } = require('./backup');
const { audit } = require('./audit');

/** Quick, read-only status for the dashboard and Settings. */
function health(db, { dataDir, backupDir, version }) {
  const ver = db.get('SELECT MAX(version) v FROM schema_migrations').v;
  const quick = db.pragma('quick_check').map((r) => Object.values(r)[0]);
  const fk = db.pragma('foreign_key_check');
  const jm = Object.values(db.pragma('journal_mode')[0])[0];
  let size = 0; try { size = fs.statSync(db.file).size; } catch (_) { /* ignore */ }
  const backups = listBackups(backupDir);
  const lastBackup = backups.find((b) => b.kind !== 'safety') || null;
  return {
    appVersion: version, schemaVersion: ver, sqliteDriver: db.driver.name, journalMode: jm,
    integrityOk: quick.length === 1 && quick[0] === 'ok' && fk.length === 0,
    dbSizeBytes: size, dbFile: db.file, dataDir, backupDir,
    lastBackupAt: lastBackup?.modified || null, backupCount: backups.length,
  };
}

/** Full integrity scan (slower). Admin-triggered. */
function integrityCheck(db, actor) {
  const full = db.pragma('integrity_check').map((r) => Object.values(r)[0]);
  const fk = db.pragma('foreign_key_check');
  // Accounting invariant: total debits must equal total credits across the whole journal.
  const t = db.get('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines');
  const result = {
    sqliteOk: full.length === 1 && full[0] === 'ok', sqliteMessages: full,
    foreignKeyViolations: fk.length, journalBalanced: t.d === t.c, totalDebit: t.d, totalCredit: t.c,
  };
  result.ok = result.sqliteOk && result.foreignKeyViolations === 0 && result.journalBalanced;
  audit(db, actor, 'system.integrity_check', 'database', null, { ok: result.ok });
  return result;
}

module.exports = { health, integrityCheck };

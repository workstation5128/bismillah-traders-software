'use strict';
const fs = require('fs');
const path = require('path');

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

/**
 * Full database snapshot into <backupDir>/<kind>/. Used before migrations/restores
 * ("safety") and for manual backups.
 */
function createBackup(db, backupDir, kind, label) {
  const dir = path.join(backupDir, kind);
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(label || kind).replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 60);
  const file = path.join(dir, `bt-pos_${stamp()}_${safe}.db`);
  db.backupTo(file);
  return { file, size: fs.statSync(file).size, kind };
}
const createSafetyBackup = (db, backupDir, label) => createBackup(db, backupDir, 'safety', label);
const createManualBackup = (db, backupDir) => createBackup(db, backupDir, 'manual', 'manual');

function listBackups(backupDir) {
  const out = [];
  for (const kind of ['manual', 'auto', 'safety']) {
    const dir = path.join(backupDir, kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.db')) continue;
      const st = fs.statSync(path.join(dir, f));
      out.push({ kind, name: f, file: path.join(dir, f), size: st.size, modified: st.mtime.toISOString() });
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

module.exports = { createBackup, createSafetyBackup, createManualBackup, listBackups };

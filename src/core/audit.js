'use strict';
/** Append-only activity log. Never throws: logging must not break a business action. */
function audit(db, user, action, entity, entityId, details) {
  try {
    db.run('INSERT INTO audit_log(user_id,username,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)',
      user?.id ?? null, user?.username ?? null, action, entity ?? null,
      entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null);
  } catch (_) { /* swallow */ }
}

function logError(db, source, err, context) {
  try {
    db.run('INSERT INTO error_log(source,message,stack,context) VALUES (?,?,?,?)',
      source, String(err?.message || err), err?.stack || null, context ? JSON.stringify(context) : null);
  } catch (_) { /* swallow */ }
}

function listAudit(db, { limit = 100, offset = 0, action, search, from, to } = {}) {
  const where = []; const p = [];
  if (action) { where.push('action = ?'); p.push(action); }
  if (search) { where.push('(username LIKE ? OR action LIKE ? OR entity LIKE ? OR details LIKE ?)'); p.push(...Array(4).fill(`%${search}%`)); }
  if (from) { where.push('ts >= ?'); p.push(from); }
  if (to) { where.push('ts < ?'); p.push(to); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const rows = db.all(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, lim, off);
  const total = db.get(`SELECT COUNT(*) n FROM audit_log ${w}`, ...p).n;
  return { rows, total };
}

module.exports = { audit, logError, listAudit };

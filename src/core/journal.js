'use strict';
/**
 * Double-entry journal. Every money movement in the app is eventually posted here.
 * Posted entries can never be edited or deleted (enforced by DB triggers);
 * corrections are made with reverseEntry().
 */
const { bad } = require('./errors');
const { nextNumber } = require('./sequences');

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

function accountId(db, codeOrId) {
  const a = typeof codeOrId === 'number'
    ? db.get('SELECT id, is_active FROM accounts WHERE id = ?', codeOrId)
    : db.get('SELECT id, is_active FROM accounts WHERE code = ?', String(codeOrId));
  if (!a) throw bad(`Unknown account: ${codeOrId}`);
  if (!a.is_active) throw bad(`Account ${codeOrId} is inactive.`);
  return a.id;
}

/**
 * lines: [{ account: '1000' | id, debit: paise, credit: paise, partyType?, partyId?, memo? }]
 * Returns { id, entryNo, duplicate }. If idempotencyKey was already posted, returns the original (no second entry).
 */
function postEntry(db, { date, description, lines, sourceType, sourceId, idempotencyKey, userId, reversesId }) {
  if (!isDate(date)) throw bad('Entry date must be a valid YYYY-MM-DD date.');
  if (!String(description || '').trim()) throw bad('Journal entry needs a description.');
  if (!Array.isArray(lines) || lines.length < 2) throw bad('A journal entry needs at least two lines.');

  return db.tx(() => {
    if (idempotencyKey) {
      const ex = db.get('SELECT id, entry_no FROM journal_entries WHERE idempotency_key = ?', idempotencyKey);
      if (ex) return { id: ex.id, entryNo: ex.entry_no, duplicate: true };
    }
    let debit = 0, credit = 0;
    const clean = lines.map((l) => {
      const d = l.debit || 0, c = l.credit || 0;
      if (!Number.isInteger(d) || !Number.isInteger(c)) throw bad('Journal amounts must be whole paise.');
      if (d < 0 || c < 0) throw bad('Journal amounts cannot be negative.');
      if ((d === 0) === (c === 0)) throw bad('Each journal line must have either a debit or a credit, not both and not neither.');
      debit += d; credit += c;
      return { acc: accountId(db, l.account), d, c, pt: l.partyType || null, pid: l.partyId ?? null, memo: l.memo || null };
    });
    if (debit !== credit) throw bad(`Entry is out of balance (debit ${debit} vs credit ${credit} paise).`);

    const entryNo = nextNumber(db, 'journal');
    const id = db.run(
      `INSERT INTO journal_entries(entry_no,entry_date,description,source_type,source_id,reverses_id,idempotency_key,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      entryNo, date, String(description).trim(), sourceType || null, sourceId == null ? null : String(sourceId),
      reversesId || null, idempotencyKey || null, userId || null).lastInsertRowid;
    for (const l of clean) {
      db.run('INSERT INTO journal_lines(entry_id,account_id,party_type,party_id,debit,credit,memo) VALUES (?,?,?,?,?,?,?)',
        id, l.acc, l.pt, l.pid, l.d, l.c, l.memo);
    }
    return { id, entryNo, duplicate: false };
  });
}

/** Post a mirror-image entry that cancels `entryId`. An entry can be reversed only once, and reversals cannot be reversed. */
function reverseEntry(db, entryId, { date, reason, userId }) {
  return db.tx(() => {
    const e = db.get('SELECT * FROM journal_entries WHERE id = ?', entryId);
    if (!e) throw bad('Journal entry not found.');
    if (e.reverses_id) throw bad('A reversal entry cannot itself be reversed.');
    if (db.get('SELECT 1 x FROM journal_entries WHERE reverses_id = ?', entryId)) throw bad(`Entry ${e.entry_no} has already been reversed.`);
    const lines = db.all('SELECT * FROM journal_lines WHERE entry_id = ?', entryId).map((l) => ({
      account: l.account_id, debit: l.credit, credit: l.debit, partyType: l.party_type, partyId: l.party_id, memo: l.memo,
    }));
    return postEntry(db, {
      date, description: `Reversal of ${e.entry_no}: ${reason || 'correction'}`,
      lines, sourceType: e.source_type, sourceId: e.source_id, reversesId: entryId, userId,
    });
  });
}

/** Debit/credit totals per account for a date range (inclusive). Dates are YYYY-MM-DD. */
function trialBalance(db, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  return db.all(
    `SELECT a.code, a.name, a.type,
            COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
       FROM accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date BETWEEN ? AND ?
      WHERE e.id IS NOT NULL OR l.id IS NULL
      GROUP BY a.id ORDER BY a.code`, from, to);
}

/** Balance of one party (customer owes you = positive). Uses Customer Receivables / Supplier Payables. */
function partyBalance(db, partyType, partyId) {
  const acct = partyType === 'customer' ? '1100' : '2000';
  const r = db.get(
    `SELECT COALESCE(SUM(l.debit),0) d, COALESCE(SUM(l.credit),0) c
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE a.code = ? AND l.party_type = ? AND l.party_id = ?`, acct, partyType, partyId);
  return partyType === 'customer' ? r.d - r.c : r.c - r.d;
}

module.exports = { postEntry, reverseEntry, trialBalance, partyBalance };

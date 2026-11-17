'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { newApp } = require('./helpers');
const J = require('../src/core/journal');

const sale = (extra = {}) => ({
  date: '2026-11-15', description: 'Test sale',
  lines: [{ account: '1000', debit: 3700000 }, { account: '1100', debit: 825000, partyType: 'customer', partyId: 1 }, { account: '4000', credit: 4525000 }],
  ...extra,
});

test('balanced entry posts; unbalanced / malformed entries are rejected', () => {
  const { db } = newApp();
  const r = J.postEntry(db, sale());
  assert.match(r.entryNo, /^JE-000001$/);
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '1000', debit: 100 }, { account: '4000', credit: 99 }] })), /out of balance/);
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '1000', debit: 100 }] })), /at least two/);
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '1000', debit: 100, credit: 100 }, { account: '4000', credit: 0, debit: 0 }] })), /either a debit or a credit/);
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '1000', debit: 1.5 }, { account: '4000', credit: 1.5 }] })), /whole paise/);
  assert.throws(() => J.postEntry(db, sale({ date: '15/11/2026' })), /YYYY-MM-DD/);
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '9999', debit: 1 }, { account: '4000', credit: 1 }] })), /Unknown account/);
  // failed attempts left nothing behind and burned no numbers
  assert.equal(db.get('SELECT COUNT(*) n FROM journal_entries').n, 1);
  assert.equal(J.postEntry(db, sale()).entryNo, 'JE-000002');
});

test('same idempotency key never posts twice', () => {
  const { db } = newApp();
  const a = J.postEntry(db, sale({ idempotencyKey: 'bill-abc' }));
  const b = J.postEntry(db, sale({ idempotencyKey: 'bill-abc' }));
  assert.equal(b.duplicate, true); assert.equal(b.id, a.id);
  assert.equal(db.get('SELECT COUNT(*) n FROM journal_entries').n, 1);
});

test('posted entries cannot be edited or deleted (database triggers)', () => {
  const { db } = newApp();
  const { id } = J.postEntry(db, sale());
  assert.throws(() => db.run('UPDATE journal_entries SET description = ? WHERE id = ?', 'hacked', id), /immutable/);
  assert.throws(() => db.run('DELETE FROM journal_entries WHERE id = ?', id), /immutable/);
  assert.throws(() => db.run('UPDATE journal_lines SET debit = 1 WHERE entry_id = ?', id), /immutable/);
  assert.throws(() => db.run('DELETE FROM journal_lines WHERE entry_id = ?', id), /immutable/);
  assert.throws(() => db.run('INSERT INTO journal_lines(entry_id,account_id,debit,credit) VALUES (?,1,5,5)', id), /CHECK|constraint/i);
});

test('reversal cancels the original exactly, once only', () => {
  const { db } = newApp();
  const { id } = J.postEntry(db, sale());
  assert.equal(J.partyBalance(db, 'customer', 1), 825000);
  const rev = J.reverseEntry(db, id, { date: '2026-11-16', reason: 'bill cancelled' });
  assert.equal(J.partyBalance(db, 'customer', 1), 0);
  assert.throws(() => J.reverseEntry(db, id, { date: '2026-11-16' }), /already been reversed/);
  assert.throws(() => J.reverseEntry(db, rev.id, { date: '2026-11-16' }), /cannot itself be reversed/);
  const tb = J.trialBalance(db);
  assert.equal(tb.reduce((s, r) => s + r.debit - r.credit, 0), 0);
  for (const row of tb.filter((r) => ['1000', '1100', '4000'].includes(r.code))) assert.equal(row.debit, row.credit, row.code + ' nets to zero');
});

test('trial balance respects date range and always balances', () => {
  const { db } = newApp();
  J.postEntry(db, sale({ date: '2026-10-31' }));
  J.postEntry(db, sale({ date: '2026-11-15' }));
  const nov = J.trialBalance(db, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(nov.find((r) => r.code === '4000').credit, 4525000);
  assert.equal(nov.reduce((s, r) => s + r.debit - r.credit, 0), 0);
  const all = J.trialBalance(db);
  assert.equal(all.find((r) => r.code === '4000').credit, 9050000);
});

test('a failure mid-posting rolls the whole entry back', () => {
  const { db } = newApp();
  // second line references a missing account id -> must not leave a half-written entry
  assert.throws(() => J.postEntry(db, sale({ lines: [{ account: '1000', debit: 5 }, { account: 9999, credit: 5 }] })));
  assert.equal(db.get('SELECT COUNT(*) n FROM journal_entries').n, 0);
  assert.equal(db.get('SELECT COUNT(*) n FROM journal_lines').n, 0);
});

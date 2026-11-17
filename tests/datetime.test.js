'use strict';
process.env.TZ = 'Asia/Karachi';        // Pakistan Standard Time, UTC+5, no daylight saving
const test = require('node:test'); const assert = require('node:assert/strict');
const load = () => import('../src/renderer/js/datetime.js');

test('12-hour clock is correct at midnight, noon and end of day', async () => {
  const { fmtTime } = await load();
  assert.equal(fmtTime(new Date(2026, 10, 17, 0, 5, 9)), '12:05 AM');
  assert.equal(fmtTime(new Date(2026, 10, 17, 12, 0, 0)), '12:00 PM');
  assert.equal(fmtTime(new Date(2026, 10, 17, 11, 30, 45), { seconds: true }), '11:30:45 AM');
  assert.equal(fmtTime(new Date(2026, 10, 17, 23, 59, 59), { seconds: true }), '11:59:59 PM');
  assert.equal(fmtTime(new Date(2026, 10, 17, 13, 7)), '1:07 PM');
  assert.equal(fmtTime('not a date'), '');
});

test('date formats follow the Settings choice', async () => {
  const { fmtDate, fmtDayDate, fmtDateTime } = await load();
  const d = new Date(2026, 10, 7, 15, 4);          // 7 Nov 2026, 3:04 PM
  assert.equal(fmtDate(d, 'DD/MM/YYYY'), '07/11/2026');
  assert.equal(fmtDate(d, 'MM/DD/YYYY'), '11/07/2026');
  assert.equal(fmtDate(d, 'YYYY-MM-DD'), '2026-11-07');
  assert.equal(fmtDate(d), '07/11/2026');
  assert.equal(fmtDayDate(d, 'DD/MM/YYYY'), 'Sat, 07/11/2026');
  assert.equal(fmtDateTime(d, 'DD/MM/YYYY'), '07/11/2026 3:04 PM');
});

test('database time (UTC) is shown as Pakistan local time, including across midnight', async () => {
  const { fmtDateTime, fmtDate } = await load();
  // A bill made at 1:30 AM on 17 Nov in Pakistan is stored as 20:30 UTC on 16 Nov.
  const stored = '2026-11-16T20:30:00.000Z';
  assert.equal(fmtDateTime(stored, 'DD/MM/YYYY'), '17/11/2026 1:30 AM');
  assert.equal(fmtDate(stored), '17/11/2026');
  assert.equal(fmtDateTime('2026-11-17T07:00:00.000Z'), '17/11/2026 12:00 PM');
  assert.equal(fmtDateTime('2026-12-31T19:30:00.000Z'), '01/01/2027 12:30 AM');   // new year rolls over correctly
});

test('"today" uses local time, not UTC (UTC is still yesterday until 5 AM in Pakistan)', async () => {
  const { localToday } = await load();
  assert.equal(localToday(new Date('2026-11-16T20:30:00Z')), '2026-11-17');
  assert.equal(localToday(new Date('2026-11-17T18:59:59Z')), '2026-11-17');
  assert.equal(localToday(new Date('2026-11-17T19:00:00Z')), '2026-11-18');      // midnight PKT
  assert.equal(localToday(new Date(2026, 0, 5, 9, 0)), '2026-01-05');
});

'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { toPaise, fmt, fmtRs, mul, percent } = require('../src/core/money');

test('toPaise parses common inputs exactly', () => {
  assert.equal(toPaise('1,250.50'), 125050);
  assert.equal(toPaise('Rs. 40'), 4000);
  assert.equal(toPaise(45), 4500);
  assert.equal(toPaise('0.1') + toPaise('0.2'), 30);      // no float drift
  assert.equal(toPaise(1.005), 101);                       // rounds half up
  assert.equal(toPaise('-12.34'), -1234);
});
test('toPaise rejects garbage', () => {
  for (const bad of ['', 'abc', '1.2.3', NaN, Infinity, null]) assert.throws(() => toPaise(bad), /not a valid number/);
});
test('fmt formats with grouping', () => {
  assert.equal(fmt(125050), '1,250.50');
  assert.equal(fmt(-5), '-0.05');
  assert.equal(fmtRs(100000000), 'Rs. 1,000,000.00');
  assert.equal(fmt(4500, { decimals: false }), '45');
});
test('mul and percent are exact', () => {
  assert.equal(mul(4300, 600), 2580000);                   // 600 bottles @ Rs.43
  assert.equal(percent(10050, 10), 1005);
  assert.throws(() => mul(1.5, 2));
});

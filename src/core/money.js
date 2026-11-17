'use strict';
/**
 * Money is stored everywhere as INTEGER PAISE (1 Rs. = 100 paise).
 * Never store or add floating-point rupees.
 */
const { bad } = require('./errors');

/** Parse user input ("1,250.50", 1250.5, "Rs. 40") into integer paise. Throws on garbage. */
function toPaise(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw bad('Amount is not a valid number.');
    return Math.round(input * 100 + (input < 0 ? -1e-9 : 1e-9));
  }
  const s = String(input ?? '').replace(/rs\.?/ig, '').replace(/[,\s]/g, '');
  if (s === '' || !/^-?\d+(\.\d{1,})?$/.test(s)) throw bad('Amount is not a valid number.');
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  let paise = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  if (frac.length > 2 && parseInt(frac[2], 10) >= 5) paise += 1; // round half up on the 3rd decimal
  return neg ? -paise : paise;
}

/** Integer paise -> "1,250.50" (no currency symbol). */
function fmt(paise, { decimals = true } = {}) {
  if (!Number.isInteger(paise)) throw new Error('fmt() expects integer paise');
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  const body = decimals || frac !== '00' ? `${whole}.${frac}` : whole;
  return (neg ? '-' : '') + body;
}
const fmtRs = (paise, opts) => 'Rs. ' + fmt(paise, opts);

/** Multiply paise by an integer quantity (always exact). */
function mul(paise, qty) {
  if (!Number.isInteger(paise) || !Number.isInteger(qty)) throw new Error('mul() expects integers');
  return paise * qty;
}

/** Percentage of paise, rounded half-up to a whole paisa. */
function percent(paise, pct) {
  return Math.round((paise * pct) / 100 + 1e-9);
}

module.exports = { toPaise, fmt, fmtRs, mul, percent };

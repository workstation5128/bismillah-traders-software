// Date and time helpers. Pure functions, no DOM. Everything is shown in the computer's LOCAL time
// (Pakistan time on your PC); the database stores UTC and we convert only for display.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n) => String(n).padStart(2, '0');
const toDate = (v) => (v instanceof Date ? v : new Date(v));

export function fmtDate(value, style = 'DD/MM/YYYY') {
  const d = toDate(value); if (Number.isNaN(d.getTime())) return '';
  const dd = p2(d.getDate()), mm = p2(d.getMonth() + 1), yy = d.getFullYear();
  return style === 'MM/DD/YYYY' ? `${mm}/${dd}/${yy}` : style === 'YYYY-MM-DD' ? `${yy}-${mm}-${dd}` : `${dd}/${mm}/${yy}`;
}
/** 12-hour clock: 12:05 AM, 12:00 PM, 11:59:59 PM */
export function fmtTime(value, { seconds = false } = {}) {
  const d = toDate(value); if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours(); const h12 = h % 12 || 12;
  return `${h12}:${p2(d.getMinutes())}${seconds ? ':' + p2(d.getSeconds()) : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function fmtDateTime(value, style) { const d = toDate(value); return Number.isNaN(d.getTime()) ? '' : `${fmtDate(d, style)} ${fmtTime(d)}`; }
export const fmtDayDate = (value, style) => { const d = toDate(value); return `${DAYS[d.getDay()]}, ${fmtDate(d, style)}`; };
/** Today's date as YYYY-MM-DD in LOCAL time (not UTC, which can be a day behind after midnight in Pakistan). */
export function localToday(now = new Date()) { return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`; }

import { h, icon, fmtRs, fmtBytes, timeAgo, localToday, fmtDate } from '../ui.js';
import { api, session } from '../api.js';

const WAVES = `<svg class="waves" viewBox="0 0 800 70" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 40 C120 10 240 70 400 38 S680 8 800 36 V70 H0Z" fill="#1E4FB0" opacity=".5"/>
  <path d="M0 22 C140 -4 250 50 410 20 S690 -6 800 20" fill="none" stroke="#FFC20E" stroke-width="2.5" opacity=".85"/></svg>`;

// Each card names the module that will feed it, so an empty dashboard explains itself.
const KPI = [
  { k: 'sales', label: 'Sales', icon: 'cart', hero: true, sub: 'Fills in as soon as you save your first bill (Stage 4).' },
  { k: 'cashReceived', label: 'Cash received', icon: 'coins', sub: 'Cash from bills and customer payments' },
  { k: 'udhaar', label: 'Udhaar given', icon: 'receipt', cls: 'gold', sub: 'Credit sales not yet paid' },
  { k: 'customerOutstanding', label: 'Customers owe you', icon: 'users', cls: 'gold', sub: 'Total outstanding balance' },
  { k: 'supplierPayable', label: 'You owe suppliers', icon: 'truck', cls: 'alert', sub: 'Supplier payable balance' },
  { k: 'purchases', label: 'Purchases', icon: 'box', sub: 'Stock bought in this period' },
  { k: 'bankBalance', label: 'Bank balance', icon: 'bank', sub: 'Across all bank accounts' },
  { k: 'grossProfit', label: 'Gross profit', icon: 'trend', cls: 'profit', sub: 'Net sales minus cost of goods sold' },
  { k: 'expenses', label: 'Expenses', icon: 'wallet', cls: 'alert', sub: 'Shop running costs' },
  { k: 'netProfit', label: 'Net operating profit', icon: 'trend', cls: 'profit', sub: 'Gross profit minus expenses' },
  { k: 'stockValue', label: 'Stock value', icon: 'layers', sub: 'At cost price' },
];

const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };
const periodLabel = (p) => {
  if (p.mode === 'month') { const [y, m] = p.value.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  return new Date(p.value + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export async function render({ state, navigate }) {
  const s = state.settings; const user = session.user;
  let period = { mode: 'day', value: localToday() };
  const kpiGrid = h('div', { class: 'kpis' });
  const periodText = h('div', { class: 'biz' });

  const dateInput = h('input', { type: 'date', value: period.value, max: '2100-12-31', 'aria-label': 'Choose a date' });
  const monthInput = h('input', { type: 'month', value: period.value.slice(0, 7), hidden: true, 'aria-label': 'Choose a month' });
  const dayBtn = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Day');
  const monthBtn = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Month');
  const todayBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Today');

  const setMode = (mode) => {
    period = { mode, value: mode === 'day' ? (dateInput.value || localToday()) : (monthInput.value || localToday().slice(0, 7)) };
    dayBtn.setAttribute('aria-pressed', String(mode === 'day')); monthBtn.setAttribute('aria-pressed', String(mode === 'month'));
    dateInput.hidden = mode !== 'day'; monthInput.hidden = mode !== 'month'; load();
  };
  dayBtn.onclick = () => setMode('day'); monthBtn.onclick = () => setMode('month');
  dateInput.onchange = () => { if (dateInput.value) { period.value = dateInput.value; load(); } };
  monthInput.onchange = () => { if (monthInput.value) { period.value = monthInput.value; load(); } };
  todayBtn.onclick = () => { dateInput.value = localToday(); monthInput.value = localToday().slice(0, 7); period.value = period.mode === 'day' ? dateInput.value : monthInput.value; load(); };

  const banner = h('section', { class: 'banner' },
    h('div', null,
      h('h2', { class: 'hello' }, `${greeting()}, ${user.displayName.split(' ')[0]}`),
      h('div', { class: 'biz' }, h('b', null, s.business_name), ` \u00b7 ${s.business_tagline}`),
      periodText,
      h('div', { class: 'controls' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Period' }, dayBtn, monthBtn), dateInput, monthInput, todayBtn)),
    h('img', { class: 'emblem', src: 'assets/logo-emblem-md.png', alt: `${s.business_name} logo` }));
  banner.insertAdjacentHTML('beforeend', WAVES);

  const lowStock = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Low-stock products'), icon('bell')),
    h('div', { class: 'empty' }, h('div', { class: 'ic-big' }, icon('box', 24)), h('strong', null, 'No products yet'),
      h('span', null, 'Products you add will show here when stock falls to the alert level.'),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: () => navigate('products') }, 'Go to products')));
  const empties = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Empties in your shop'), icon('repeat')),
    h('div', { class: 'pair' }, h('div', { class: 'tile' }, h('div', { class: 'muted' }, 'Empty bottles'), h('div', { class: 'v' }, '\u2014')),
      h('div', { class: 'tile' }, h('div', { class: 'muted' }, 'Empty crates'), h('div', { class: 'v' }, '\u2014'))),
    h('p', { class: 'muted', style: 'margin:-6px 20px 18px;font-size:12.5px' }, 'Tracked separately from product stock (Stage 5).'));
  const healthBox = h('div', { class: 'card card-pad health' });
  const recent = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Recent bills')),
    h('div', { class: 'empty' }, h('div', { class: 'ic-big' }, icon('receipt', 24)), h('strong', null, 'No bills yet'),
      h('span', null, 'Your latest bills will be listed here once billing is available.')));

  function paintKpis(data) {
    kpiGrid.replaceChildren(...KPI.map((c) => {
      const v = data.metrics[c.k]; const live = Number.isInteger(v);
      return h('div', { class: `card kpi ${c.hero ? 'hero' : ''} ${c.cls || ''}` },
        h('div', { class: 'top' }, h('span', null, c.label), h('span', { class: 'chipic' }, icon(c.icon))),
        h('div', { class: `val ${live ? '' : 'pending'}` }, live ? fmtRs(v) : '\u2014'),
        h('div', { class: 'sub' }, c.sub));
    }));
    periodText.textContent = `Showing ${periodLabel(data.period)}`;
  }
  async function load() {
    try { paintKpis(await api('dashboard.summary', period)); }
    catch (e) { periodText.textContent = e.message; }
  }
  function paintHealth(hl) {
    if (!hl) return;
    healthBox.replaceChildren(
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('h3', { style: 'font-size:16px' }, 'Data safety'),
        h('span', { class: `chip ${hl.integrityOk ? 'ok' : 'bad'}` }, hl.integrityOk ? 'Database healthy' : 'Needs attention')),
      h('dl', null,
        h('dt', null, 'Last backup'), h('dd', null, hl.lastBackupAt ? timeAgo(hl.lastBackupAt) : 'Never'),
        h('dt', null, 'Database size'), h('dd', null, fmtBytes(hl.dbSizeBytes)),
        h('dt', null, 'Schema version'), h('dd', null, String(hl.schemaVersion)),
        h('dt', null, 'Saved at'), h('dd', { style: 'font-size:12px;font-weight:500' }, hl.dbFile)));
  }
  paintHealth(state.health);
  await load();
  return h('div', null, banner, kpiGrid, h('div', { class: 'row3' }, lowStock, empties, healthBox), recent);
}

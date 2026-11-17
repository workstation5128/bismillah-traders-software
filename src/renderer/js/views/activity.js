import { h, icon, fmtDateTime } from '../ui.js';
import { api } from '../api.js';
import { state } from '../shell.js';

const LABEL = {
  'login.success': 'Signed in', 'login.failed': 'Failed sign-in', 'login.locked': 'Account locked', logout: 'Signed out',
  'setup.admin_created': 'Owner account created', 'settings.updated': 'Settings changed', 'user.created': 'User added', 'user.updated': 'User changed',
  'user.password_reset': 'Password reset', 'user.password_changed': 'Password changed', 'backup.manual': 'Backup created', 'product.created': 'Product added', 'product.updated': 'Product changed', 'product.activated': 'Product activated', 'product.deactivated': 'Product made inactive', 'stock.adjustment': 'Stock adjusted', 'stock.damage': 'Damage recorded', 'stock.audit': 'Stock counted', 'system.integrity_check': 'Integrity check',
};
const PAGE = 50;

export async function render() {
  let offset = 0;
  const search = h('input', { class: 'input', placeholder: 'Search the log', 'aria-label': 'Search the activity log', style: 'max-width:320px' });
  const from = h('input', { class: 'input', type: 'date', 'aria-label': 'From date', style: 'max-width:170px' });
  const to = h('input', { class: 'input', type: 'date', 'aria-label': 'To date', style: 'max-width:170px' });
  const body = h('tbody'); const info = h('span', { class: 'muted' }); const prev = h('button', { class: 'btn btn-ghost btn-sm' }, 'Newer');
  const next = h('button', { class: 'btn btn-ghost btn-sm' }, 'Older');

  async function load() {
    const nextDay = to.value ? new Date(new Date(to.value).getTime() + 864e5).toISOString().slice(0, 10) : undefined;
    const r = await api('audit.list', { limit: PAGE, offset, search: search.value.trim() || undefined, from: from.value || undefined, to: nextDay });
    body.replaceChildren(...(r.rows.length ? r.rows.map((x) => h('tr', null,
      h('td', { class: 'muted', style: 'white-space:nowrap' }, fmtDateTime(x.ts, state.settings.date_format)),
      h('td', null, x.username || h('span', { class: 'muted' }, 'Not signed in')),
      h('td', null, h('strong', null, LABEL[x.action] || x.action)),
      h('td', { class: 'muted', style: 'font-size:12.5px;word-break:break-word' }, x.details || '')))
      : [h('tr', null, h('td', { colspan: 4 }, h('div', { class: 'empty' }, h('strong', null, 'Nothing matches'), h('span', null, 'Try a different search or date range.'))))]));
    info.textContent = r.total ? `${offset + 1}\u2013${Math.min(offset + PAGE, r.total)} of ${r.total}` : '0 entries';
    prev.disabled = offset === 0; next.disabled = offset + PAGE >= r.total;
  }
  let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { offset = 0; load(); }, 250); };
  from.onchange = to.onchange = () => { offset = 0; load(); };
  prev.onclick = () => { offset = Math.max(0, offset - PAGE); load(); }; next.onclick = () => { offset += PAGE; load(); };
  await load();
  return h('div', { style: 'max-width:1100px' },
    h('div', { class: 'page-head' }, h('div', null, h('h2', { style: 'font-size:22px' }, 'Everything that happened'), h('p', null, 'Every sign-in and change is recorded here. Entries cannot be edited or deleted.')),
      h('div', { style: 'display:flex;gap:10px;align-items:center' }, search, from, to)),
    h('div', { class: 'card table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['When', 'Who', 'What', 'Details'].map((t) => h('th', null, t)))), body),
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px' }, info, h('div', { style: 'display:flex;gap:8px' }, prev, next))));
}

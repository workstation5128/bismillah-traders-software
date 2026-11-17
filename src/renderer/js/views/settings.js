import { h, icon, field, toast, formError, showFieldErrors, fmtBytes } from '../ui.js';
import { api, session } from '../api.js';
import { can } from '../nav.js';

export async function render({ state }) {
  const s = await api('settings.get'); const canEdit = can(session.user, 'settings.manage');
  const text = (k, label, hint) => field(label, h('input', { class: 'input', name: k, value: s[k], disabled: !canEdit }), { hint });
  const sel = (k, label, opts, hint) => field(label, h('select', { class: 'select', name: k, disabled: !canEdit },
    opts.map(([v, t]) => h('option', { value: v, selected: s[k] === v }, t))), { hint });
  const num = (k, label, hint) => field(label, h('input', { class: 'input', name: k, type: 'number', min: '0', value: s[k], disabled: !canEdit }), { hint });
  const slot = h('div');

  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault(); slot.replaceChildren(); showFieldErrors(form, null);
    const body = {}; for (const el of form.querySelectorAll('[name]')) body[el.name] = el.value;
    try { state.settings = await api('settings.update', body); toast('Settings saved.', 'ok'); }
    catch (err) { slot.replaceChildren(formError(err.message)); }
  } },
  slot,
  h('div', { class: 'card card-pad', style: 'margin-bottom:16px' },
    h('div', { style: 'display:flex;gap:24px;align-items:flex-start' },
      h('div', { style: 'flex:1' }, h('h3', { style: 'margin-bottom:14px' }, 'Business profile'),
        text('business_name', 'Business name'), text('business_tagline', 'Tagline'), text('business_address', 'Address', 'Printed on receipts and reports.'), text('business_phone', 'Phone')),
      h('img', { src: 'assets/logo-emblem-md.png', alt: 'Business logo', style: 'width:220px;margin-top:6px' }))),
  h('div', { class: 'card card-pad', style: 'margin-bottom:16px' }, h('h3', { style: 'margin-bottom:14px' }, 'Receipts and display'),
    h('div', { class: 'grid-2' },
      sel('receipt_width', 'Receipt size', [['58', '58 mm thermal'], ['80', '80 mm thermal'], ['A4', 'A4 invoice']], 'Used as the default when printing bills.'),
      sel('date_format', 'Date format', [['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']]),
      field('Currency', h('input', { class: 'input', value: 'Pakistani Rupee (Rs.)', disabled: true })),
      num('low_stock_default', 'Default low-stock alert (bottles)', 'Starting value for new products.'))),
  h('div', { class: 'card card-pad', style: 'margin-bottom:16px' }, h('h3', { style: 'margin-bottom:14px' }, 'Security'),
    h('div', { class: 'grid-2' }, num('session_idle_minutes', 'Sign out after (minutes idle)', 'Between 5 and 1440 minutes.'))),
  canEdit ? h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Save settings') : h('p', { class: 'muted' }, 'Only an administrator can change settings.'));

  const hl = state.health;
  const dataCard = h('div', { class: 'card card-pad', style: 'margin-top:16px' }, h('h3', { style: 'margin-bottom:6px' }, 'Where your data lives'),
    h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Everything is saved on this computer. Updating or reinstalling the program does not delete it.'),
    hl && h('div', { class: 'health' }, h('dl', { style: 'margin:0' },
      h('dt', null, 'Database file'), h('dd', { style: 'font-size:12.5px;font-weight:500' }, hl.dbFile),
      h('dt', null, 'Backups folder'), h('dd', { style: 'font-size:12.5px;font-weight:500' }, hl.backupDir),
      h('dt', null, 'Size'), h('dd', null, fmtBytes(hl.dbSizeBytes)),
      h('dt', null, 'Program version'), h('dd', null, hl.appVersion))));
  return h('div', { style: 'max-width:900px' }, form, dataCard);
}

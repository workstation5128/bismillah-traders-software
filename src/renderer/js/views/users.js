import { h, icon, openModal, field, formError, showFieldErrors, toast, fmtDateTime } from '../ui.js';
import { api, session } from '../api.js';
import { state } from '../shell.js';

const ROLE = { admin: 'Administrator', cashier: 'Cashier' };

export async function render() {
  const wrap = h('div', { style: 'max-width:1000px' });
  async function draw() {
    const { users, roles } = await api('users.list');
    const addBtn = h('button', { class: 'btn btn-primary', onClick: () => userModal(null, roles, draw) }, icon('plus', 18), 'Add user');
    const rows = users.map((u) => h('tr', null,
      h('td', null, h('strong', null, u.displayName), h('div', { class: 'muted', style: 'font-size:12.5px' }, u.username)),
      h('td', null, h('span', { class: `chip ${u.role === 'admin' ? '' : 'gold'}` }, ROLE[u.role] || u.role)),
      h('td', null, h('span', { class: `chip ${u.isActive ? 'ok' : 'off'}` }, u.isActive ? 'Active' : 'Disabled'), u.mustChangePassword ? h('span', { class: 'chip gold', style: 'margin-left:6px' }, 'Temporary password') : null),
      h('td', { class: 'muted' }, u.lastLoginAt ? fmtDateTime(u.lastLoginAt, state.settings.date_format) : 'Never'),
      h('td', { class: 'r' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: () => userModal(u, roles, draw) }, 'Edit'), ' ',
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => resetModal(u) }, 'Reset password'))));
    wrap.replaceChildren(
      h('div', { class: 'page-head' }, h('div', null, h('h2', { style: 'font-size:22px' }, 'People who can sign in'),
        h('p', null, 'Cashiers can bill and take payments. They cannot see cost prices, change settings or manage users.')), addBtn),
      h('div', { class: 'card table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['User', 'Role', 'Status', 'Last sign-in', ''].map((t, i) => h('th', { class: i === 4 ? 'r' : '' }, t)))), h('tbody', null, rows))));
  }
  await draw(); return wrap;
}

function userModal(u, roles, done) {
  const isNew = !u; const slot = h('div');
  const f = {
    displayName: h('input', { class: 'input', name: 'displayName', value: u?.displayName || '' }),
    username: h('input', { class: 'input', name: 'username', value: u?.username || '', disabled: !isNew }),
    role: h('select', { class: 'select', name: 'role' }, roles.map((r) => h('option', { value: r.name, selected: (u?.role || 'cashier') === r.name }, r.label))),
    password: h('input', { class: 'input', type: 'text', name: 'password', autocomplete: 'off' }),
    active: h('select', { class: 'select', name: 'isActive' }, h('option', { value: '1', selected: u?.isActive !== false }, 'Active'), h('option', { value: '0', selected: u?.isActive === false }, 'Disabled')),
  };
  const body = h('div', null, slot, field('Full name', f.displayName), field('Username', f.username, { hint: isNew ? 'Letters and numbers, no spaces.' : 'Usernames cannot be changed.' }),
    field('Role', f.role), isNew ? field('Temporary password', f.password, { hint: 'They will be asked to choose their own at first sign-in.' }) : field('Status', f.active));
  openModal({ title: isNew ? 'Add user' : `Edit ${u.displayName}`, body, actions: [{ label: 'Cancel', value: false },
    { label: isNew ? 'Add user' : 'Save changes', kind: 'primary', closes: false, onClick: async (m) => {
      slot.replaceChildren(); showFieldErrors(body, null);
      try {
        if (isNew) await api('users.create', { username: f.username.value, displayName: f.displayName.value, role: f.role.value, password: f.password.value });
        else await api('users.update', { id: u.id, displayName: f.displayName.value, role: f.role.value, isActive: f.active.value === '1' });
        toast(isNew ? 'User added.' : 'User updated.', 'ok'); m.close(true); await done();
      } catch (err) { showFieldErrors(body, err); slot.append(formError(err.message)); }
      return false;
    } }] });
}

function resetModal(u) {
  const pw = h('input', { class: 'input', type: 'text', name: 'password', autocomplete: 'off' }); const slot = h('div');
  const body = h('div', null, slot, field('New temporary password', pw, { hint: `${u.displayName} will be signed out and must choose a new password at next sign-in.` }));
  openModal({ title: `Reset password for ${u.displayName}`, body, actions: [{ label: 'Cancel', value: false },
    { label: 'Reset password', kind: 'primary', closes: false, onClick: async (m) => {
      slot.replaceChildren();
      try { await api('users.resetPassword', { id: u.id, newPassword: pw.value }); toast('Password reset.', 'ok'); m.close(true); }
      catch (err) { slot.append(formError(err.message)); }
      return false;
    } }] });
}

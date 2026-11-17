import { h, clear, icon, openModal, field, formError, showFieldErrors, toast, timeAgo, fmtDate } from './ui.js';
import { api, session } from './api.js';
import { NAV, flat, can, titleOf } from './nav.js';
import { renderPlaceholder } from './views/placeholder.js';

const BUILT = {
  dashboard: () => import('./views/dashboard.js'),
  settings: () => import('./views/settings.js'),
  users: () => import('./views/users.js'),
  activity: () => import('./views/activity.js'),
  backup: () => import('./views/backup.js'),
};

export const state = { settings: {}, health: null };
let current = null, navRoot, viewEl, titleEl, backupChip;

export async function refreshHealth() {
  try { state.health = await api('system.health'); } catch { /* shown as unknown */ }
  paintBackupChip();
}
function paintBackupChip() {
  if (!backupChip) return;
  const hl = state.health; let cls = 'warn', text = 'Backup status unknown';
  if (hl) {
    if (!hl.integrityOk) { cls = 'bad'; text = 'Database needs attention'; }
    else if (!hl.lastBackupAt) { cls = 'warn'; text = 'No backup yet'; }
    else { const days = (Date.now() - new Date(hl.lastBackupAt).getTime()) / 864e5; cls = days > 7 ? 'warn' : ''; text = `Backed up ${timeAgo(hl.lastBackupAt)}`; }
  }
  backupChip.replaceChildren(h('span', { class: `dot ${cls}` }), text);
}

export function navigate(id) { if (location.hash !== `#/${id}`) location.hash = `#/${id}`; else show(id); }

async function show(id) {
  const user = session.user;
  const item = flat().find((n) => n.id === id && can(user, n.perm)) || flat().find((n) => n.id === 'dashboard');
  current = item.id;
  titleEl.textContent = item.label;
  document.title = `${item.label} - Bismillah Traders POS`;
  navRoot.querySelectorAll('.nav-item').forEach((b) => {
    if (b.dataset.id === current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  clear(viewEl);
  try {
    if (BUILT[item.id]) { const mod = await BUILT[item.id](); if (current !== item.id) return; viewEl.append(await mod.render({ state, navigate })); }
    else viewEl.append(renderPlaceholder(item));
  } catch (err) {
    viewEl.append(h('div', { class: 'card card-pad' }, formError(err.message || 'This page could not be loaded.')));
  }
  viewEl.scrollTop = 0;
}

function openPalette() {
  const user = session.user; const items = flat().filter((n) => can(user, n.perm));
  let idx = 0, list = items;
  const input = h('input', { type: 'text', placeholder: 'Go to a screen\u2026 (customers, products and bills become searchable as those modules arrive)', 'aria-label': 'Search' });
  const ul = h('ul', { role: 'listbox' });
  const m = openModal({ title: 'Search', body: h('div'), dismissible: true });
  const modalEl = m.el; modalEl.className = 'modal palette'; modalEl.replaceChildren(input, ul);
  const go = (n) => { m.close(); navigate(n.id); };
  const draw = () => ul.replaceChildren(...list.map((n, i) => h('li', null, h('button', { type: 'button', 'aria-selected': String(i === idx), onClick: () => go(n) },
    icon(n.icon), h('span', null, n.label), n.stage ? h('span', { class: 'chip gold', style: 'margin-left:auto' }, `Stage ${n.stage}`) : null))));
  input.addEventListener('input', () => { const q = input.value.trim().toLowerCase(); list = items.filter((n) => n.label.toLowerCase().includes(q)); idx = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, list.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && list[idx]) go(list[idx]);
  });
  draw(); input.focus();
}

export function openChangePassword({ forced = false } = {}) {
  const cur = h('input', { class: 'input', type: 'password', name: 'currentPassword', autocomplete: 'current-password' });
  const nw = h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'new-password' });
  const nw2 = h('input', { class: 'input', type: 'password', name: 'confirm', autocomplete: 'new-password' });
  const slot = h('div');
  const body = h('div', null, forced ? h('p', { class: 'muted', style: 'margin:4px 0 14px' }, 'An administrator set a temporary password for you. Choose your own to continue.') : null,
    slot, field('Current password', cur), field('New password', nw, { hint: 'At least 6 characters.' }), field('Confirm new password', nw2));
  return openModal({ title: 'Change password', body, dismissible: !forced, actions: [
    ...(forced ? [] : [{ label: 'Cancel', value: false }]),
    { label: 'Save password', kind: 'primary', closes: false, onClick: async (m) => {
      slot.replaceChildren(); showFieldErrors(body, null);
      if (nw.value !== nw2.value) { nw2.classList.add('invalid'); slot.append(formError('The new passwords do not match.')); return false; }
      try { await api('auth.changePassword', { currentPassword: cur.value, newPassword: nw.value }); session.user.mustChangePassword = false; toast('Password changed.', 'ok'); m.close(true); return false; }
      catch (err) { showFieldErrors(body, err); slot.append(formError(err.message)); return false; }
    } },
  ] });
}

export async function mountShell(root, { onLogout }) {
  const user = session.user;
  state.settings = await api('settings.get');
  navRoot = h('nav', { class: 'nav', 'aria-label': 'Main' });
  const btn = (n) => h('button', { class: 'nav-item', 'data-id': n.id, onClick: () => navigate(n.id) },
    icon(n.icon), h('span', { class: 't' }, n.label), n.key ? h('span', { class: 'kbd' }, n.key) : n.stage ? h('span', { class: 'soon' }, `Stage ${n.stage}`) : null);
  for (const entry of NAV) {
    if (entry.top) { if (can(user, entry.perm)) navRoot.append(h('div', { class: 'nav-group' }, btn(entry))); continue; }
    const items = entry.items.filter((n) => can(user, n.perm)); if (!items.length) continue;
    navRoot.append(h('div', { class: 'nav-group' }, h('div', { class: 'gl' }, entry.group), items.map(btn)));
  }
  titleEl = h('h1', null, 'Dashboard');
  backupChip = h('button', { class: 'top-chip btn-ghost', style: 'border:0;background:transparent', onClick: () => can(user, 'backup.manage') && navigate('backup'), title: 'Backup status' });
  const initials = user.displayName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const menu = h('div', { class: 'menu', hidden: true },
    h('div', { class: 'who' }, h('strong', null, user.displayName), h('div', { class: 'muted' }, `${user.role === 'admin' ? 'Administrator' : 'Cashier'} \u00b7 ${user.username}`)),
    h('button', { onClick: () => { menu.hidden = true; openChangePassword(); } }, icon('key'), 'Change password'),
    h('button', { onClick: async () => { menu.hidden = true; try { await api('auth.logout'); } catch (_) { /* already out */ } onLogout(); } }, icon('logout'), 'Sign out'));
  const userBtn = h('button', { class: 'user-btn', 'aria-haspopup': 'menu', onClick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } },
    h('span', { class: 'avatar' }, initials), h('span', null, user.displayName.split(' ')[0]));
  document.addEventListener('click', () => { menu.hidden = true; });

  viewEl = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  root.replaceChildren(h('div', { class: 'app', style: 'position:relative' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('img', { src: 'assets/bt-monogram-128.png', alt: '' }),
        h('div', null, h('div', { class: 'name' }, state.settings.business_name), h('div', { class: 'tag' }, state.settings.business_tagline))),
      navRoot, h('div', { class: 'side-foot' }, `Bismillah Traders POS v${state.version || ''}`)),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' }, titleEl,
        h('button', { class: 'search-btn', onClick: openPalette, 'aria-label': 'Search' }, icon('search', 18), 'Search screens', h('kbd', null, 'Ctrl K')),
        backupChip, h('span', { class: 'top-chip' }, icon('calendar', 18), fmtDate(new Date(), state.settings.date_format)), userBtn, menu),
      viewEl)));

  const keys = Object.fromEntries(flat().filter((n) => n.key && can(user, n.perm)).map((n) => [n.key, n.id]));
  window.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (keys[e.key]) { e.preventDefault(); navigate(keys[e.key]); }
  };
  window.onhashchange = () => show(location.hash.replace(/^#\//, '') || 'dashboard');
  await refreshHealth();
  if (user.mustChangePassword) openChangePassword({ forced: true });
  await show(location.hash.replace(/^#\//, '') || 'dashboard');
}

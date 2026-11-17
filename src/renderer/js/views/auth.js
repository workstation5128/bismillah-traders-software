import { h, icon, field, formError, showFieldErrors } from '../ui.js';
import { api, session } from '../api.js';

const WAVES = `<svg class="waves" viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 90 C120 40 240 140 400 90 S680 40 800 90 V160 H0Z" fill="#1E4FB0" opacity=".55"/>
  <path d="M0 115 C140 75 260 150 420 112 S690 80 800 118 V160 H0Z" fill="#0B2A6F" opacity=".8"/>
  <path d="M0 70 C130 30 250 110 410 68 S690 24 800 62" fill="none" stroke="#FFC20E" stroke-width="3" opacity=".9"/></svg>`;

function hero(promise) {
  const el = h('section', { class: 'auth-hero' },
    h('img', { class: 'emblem', src: 'assets/logo-emblem.png', alt: 'Bismillah Traders - Cold Drinks & Juices' }),
    h('p', { class: 'promise' }, promise));
  el.insertAdjacentHTML('afterbegin', WAVES); // static trusted markup
  return el;
}

function passwordInput(name, autocomplete) {
  const input = h('input', { class: 'input', type: 'password', name, autocomplete, required: true });
  const eye = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Show password', onClick: () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    eye.replaceChildren(icon(show ? 'eyeoff' : 'eye')); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  } }, icon('eye'));
  return { wrap: h('div', { class: 'input-wrap' }, input, eye), input };
}

export function renderLogin(root, { business, version, message, onDone }) {
  const username = h('input', { class: 'input', name: 'username', autocomplete: 'username', required: true, autofocus: true });
  const pw = passwordInput('password', 'current-password');
  const slot = h('div');
  if (message) slot.append(formError(message));
  const btn = h('button', { class: 'btn btn-gold btn-lg', type: 'submit' }, 'Sign in');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault(); slot.replaceChildren(); btn.disabled = true;
    try {
      const r = await api('auth.login', { username: username.value, password: pw.input.value });
      session.token = r.token; session.user = r.user; await onDone();
    } catch (err) { slot.replaceChildren(formError(err.message)); pw.input.value = ''; pw.input.focus(); btn.disabled = false; }
  } }, slot, field('Username', username), field('Password', pw.wrap), btn);

  root.replaceChildren(h('div', { class: 'auth' },
    hero(['Billing, stock and accounts for your ', h('span', null, 'cold drinks agency'), '.']),
    h('main', { class: 'auth-panel' }, h('div', { class: 'auth-card' },
      h('h2', null, 'Welcome back'), h('p', null, `Sign in to ${business.name} POS.`), form,
      h('div', { class: 'auth-foot' }, icon('shield', 18), h('span', null, `Works offline. Your data stays on this computer. v${version}`))))));
}

export function renderSetup(root, { business, version, onDone }) {
  const f = {
    businessName: h('input', { class: 'input', name: 'businessName', value: business.name, required: true }),
    displayName: h('input', { class: 'input', name: 'displayName', autocomplete: 'name', required: true, autofocus: true }),
    username: h('input', { class: 'input', name: 'username', autocomplete: 'username', required: true }),
  };
  const p1 = passwordInput('password', 'new-password'); const p2 = passwordInput('confirm', 'new-password');
  const slot = h('div'); const btn = h('button', { class: 'btn btn-gold btn-lg', type: 'submit' }, 'Create account and start');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault(); slot.replaceChildren(); showFieldErrors(form, null);
    if (p1.input.value !== p2.input.value) { p2.input.classList.add('invalid'); slot.replaceChildren(formError('The two passwords do not match.')); return; }
    btn.disabled = true;
    try {
      const r = await api('auth.setup', { businessName: f.businessName.value, displayName: f.displayName.value, username: f.username.value, password: p1.input.value });
      session.token = r.token; session.user = r.user; await onDone();
    } catch (err) { showFieldErrors(form, err); slot.replaceChildren(formError(err.message)); btn.disabled = false; }
  } }, slot,
  field('Business name', f.businessName),
  field('Your name', f.displayName),
  field('Username', f.username, { hint: 'Letters and numbers, no spaces. You will use this to sign in.' }),
  field('Password', p1.wrap, { hint: 'At least 6 characters. Write it down somewhere safe; there is no recovery email.' }),
  field('Confirm password', p2.wrap), btn);

  root.replaceChildren(h('div', { class: 'auth' },
    hero(['Let\u2019s set up ', h('span', null, business.name), '.']),
    h('main', { class: 'auth-panel' }, h('div', { class: 'auth-card' },
      h('h2', null, 'Create the owner account'),
      h('p', null, 'This account can manage users, settings and backups. You can add cashiers afterwards.'), form,
      h('div', { class: 'auth-foot' }, icon('shield', 18), h('span', null, `No default passwords are ever installed. v${version}`))))));
}

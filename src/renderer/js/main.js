import { h } from './ui.js';
import { api, session, onAuthLost } from './api.js';
import { renderLogin, renderSetup } from './views/auth.js';
import { mountShell, state } from './shell.js';

const root = document.getElementById('root');

async function start(message) {
  let status;
  try { status = await api('auth.status'); }
  catch (e) { root.replaceChildren(h('div', { class: 'splash', style: 'color:#fff;text-align:center;padding:40px' }, e.message)); return; }
  state.version = status.version;
  const done = () => mountShell(root, { onLogout: () => start() });
  if (status.needsSetup) renderSetup(root, { business: status.business, version: status.version, onDone: done });
  else renderLogin(root, { business: status.business, version: status.version, message, onDone: done });
}

onAuthLost((err) => { window.onkeydown = null; start(err.message); });
start();

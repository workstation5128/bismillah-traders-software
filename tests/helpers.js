'use strict';
process.env.BT_SQLITE_DRIVER = process.env.BT_SQLITE_DRIVER || 'node';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createApp } = require('../src/ipc/registry');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bt-test-'));
function newApp(dir) { return createApp({ dataDir: dir || tmp(), version: 'test' }); }
async function adminApp() {
  const dir = tmp(); const app = newApp(dir);
  const r = await app.invoke('auth.setup', { businessName: 'Bismillah Traders', displayName: 'Owner', username: 'owner', password: 'secret123' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { app, dir, token: r.data.token, call: (ch, p) => app.invoke(ch, p, r.data.token) };
}
module.exports = { tmp, newApp, adminApp };

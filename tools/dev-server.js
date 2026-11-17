'use strict';
/**
 * Browser dev/test harness. Serves the SAME renderer and the SAME back-end API as the Electron app,
 * so the UI can be developed and tested without Electron. Not shipped in the installer.
 *   node tools/dev-server.js [port] [dataDir]
 */
process.env.BT_SQLITE_DRIVER = process.env.BT_SQLITE_DRIVER || 'node';
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { createApp } = require('../src/ipc/registry');

const port = Number(process.argv[2] || process.env.PORT || 5174);
const dataDir = process.argv[3] || path.join(__dirname, '..', 'dev-data');
const root = path.join(__dirname, '..', 'src', 'renderer');
const app = createApp({ dataDir, version: require('../package.json').version + '-dev' });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__invoke') {
    let body = ''; for await (const c of req) body += c;
    let out; try { const { channel, payload, token } = JSON.parse(body); out = await app.invoke(channel, payload, token); }
    catch { out = { ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid request.' } }; }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out));
  }
  const rel = decodeURIComponent(req.url.split('?')[0]); const file = path.normalize(path.join(root, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Dev server: http://127.0.0.1:${port}  (data: ${dataDir})`));

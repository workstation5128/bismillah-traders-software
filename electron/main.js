'use strict';
const { app, BrowserWindow, ipcMain, Menu, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const RENDERER_ROOT = path.join(__dirname, '..', 'src', 'renderer');
// Serve the UI from app://bt/ (not file://) so ES modules, fetch and the CSP behave consistently.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const VERSION = app.getVersion();
let win = null;
let backend = null;

function logLine(dir, text) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `app-${new Date().toISOString().slice(0, 10)}.log`), `[${new Date().toISOString()}] ${text}\n`);
  } catch (_) { /* never crash because of logging */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // two copies writing to one database would be dangerous
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  process.on('uncaughtException', (e) => logLine(path.join(app.getPath('userData'), 'logs'), 'uncaughtException ' + (e.stack || e)));
  process.on('unhandledRejection', (e) => logLine(path.join(app.getPath('userData'), 'logs'), 'unhandledRejection ' + (e?.stack || e)));

  app.whenReady().then(() => {
    const dataDir = app.getPath('userData'); // %AppData%\Bismillah Traders POS
    try {
      const { createApp } = require('../src/ipc/registry');
      backend = createApp({ dataDir, version: VERSION });
    } catch (e) {
      logLine(path.join(dataDir, 'logs'), 'startup failed ' + (e.stack || e));
      dialog.showErrorBox('Bismillah Traders POS could not start', `${e.message}\n\nYour data folder:\n${dataDir}\n\nNo data was deleted.`);
      app.exit(1);
      return;
    }

    ipcMain.handle('bt:invoke', (_e, req) => {
      if (!req || typeof req.channel !== 'string') return { ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid request.' } };
      return backend.invoke(req.channel, req.payload, req.token);
    });

    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname);
      const file = path.normalize(path.join(RENDERER_ROOT, rel === '/' ? 'index.html' : rel));
      if (!file.startsWith(RENDERER_ROOT)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });

    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1440, height: 900, minWidth: 1100, minHeight: 680,
      backgroundColor: '#0B2A6F', show: false, title: 'Bismillah Traders POS',
      icon: path.join(__dirname, '..', 'build', 'icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        devTools: !app.isPackaged, spellcheck: false,
      },
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
    win.loadURL('app://bt/index.html');
  });

  app.on('window-all-closed', () => { try { backend?.close(); } catch (_) { /* ignore */ } app.quit(); });
}

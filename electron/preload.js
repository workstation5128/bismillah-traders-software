'use strict';
// Sandboxed preload: the ONLY bridge between the UI and the back-end.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bt', {
  invoke: (channel, payload, token) => ipcRenderer.invoke('bt:invoke', { channel, payload, token }),
  platform: process.platform,
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spiderDesktop', {
  isDesktop: () => true,
  startLogin: () => ipcRenderer.invoke('spider-desktop:start-login'),
  getLoginStatus: () => ipcRenderer.invoke('spider-desktop:get-login-status'),
});


const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('traeAccounts', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  syncTraeAccount: () => ipcRenderer.invoke('accounts:sync-trae'),
  addAccount: (token, tokenExpiredAt) => ipcRenderer.invoke('accounts:add', { token, tokenExpiredAt }),
  importFromTrae: () => ipcRenderer.invoke('accounts:import-from-trae'),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', { id }),
  updateAccountMeta: (id, meta) => ipcRenderer.invoke('accounts:update-meta', { id, ...meta }),
  bindMachineId: (id) => ipcRenderer.invoke('accounts:bind-machine', { id }),
  regenerateMachineId: (id) => ipcRenderer.invoke('accounts:regen-machine', { id }),
  getMachineInfo: () => ipcRenderer.invoke('accounts:get-machine'),
  checkSwitch: (id) => ipcRenderer.invoke('accounts:check-switch', { id }),
  exportAccounts: (opts) => ipcRenderer.invoke('accounts:export', opts || {}),
  pickImportFile: () => ipcRenderer.invoke('accounts:pick-import-file'),
  importAccountsContent: (opts) => ipcRenderer.invoke('accounts:import-content', opts || {}),
  switchAccount: (id, skipCheck) => ipcRenderer.invoke('accounts:switch', { id, skipCheck }),
  cleanAndSwitch: (id) => ipcRenderer.invoke('accounts:clean-and-switch', { id }),
  getUsageHistory: () => ipcRenderer.invoke('accounts:get-usage-history'),
  checkAlerts: () => ipcRenderer.invoke('accounts:notify-check'),
  getAccountUsage: (id) => ipcRenderer.invoke('accounts:get-usage', { id }),
  refreshProfiles: () => ipcRenderer.invoke('accounts:refresh-profiles'),
  refreshExpiredTokens: () => ipcRenderer.invoke('accounts:refresh-expired'),
  refreshAccountToken: (id) => ipcRenderer.invoke('accounts:refresh-token', { id }),
  startBrowserLogin: (accountId) => ipcRenderer.invoke('accounts:start-browser-login', { accountId }),
  cancelBrowserLogin: () => ipcRenderer.invoke('accounts:cancel-browser-login'),

  onLoginSuccess: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('login:success', handler);
    return () => ipcRenderer.removeListener('login:success', handler);
  },
  onLoginFailed: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('login:failed', handler);
    return () => ipcRenderer.removeListener('login:failed', handler);
  },
  onLoginCancelled: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('login:cancelled', handler);
    return () => ipcRenderer.removeListener('login:cancelled', handler);
  },
  onTraeAccountChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('trae:account-changed', handler);
    return () => ipcRenderer.removeListener('trae:account-changed', handler);
  },

  getTraePath: () => ipcRenderer.invoke('settings:get-trae-path'),
  setTraePath: (traePath) => ipcRenderer.invoke('settings:set-trae-path', { traePath }),
  scanTraePath: () => ipcRenderer.invoke('settings:scan-trae-path'),
  pickTraePath: () => ipcRenderer.invoke('settings:pick-trae-path'),
  pickBackupDir: () => ipcRenderer.invoke('settings:pick-backup-dir'),
  runBackupNow: () => ipcRenderer.invoke('settings:run-backup-now'),
  getLastBackup: () => ipcRenderer.invoke('settings:last-backup'),
  getPlatform: () => ipcRenderer.invoke('settings:platform'),
  getAppSettings: () => ipcRenderer.invoke('settings:get-app'),
  saveAppSettings: (settings) => ipcRenderer.invoke('settings:save-app', settings),

  scanClean: () => ipcRenderer.invoke('clean:scan'),
  startClean: () => ipcRenderer.invoke('clean:start'),
  cancelClean: () => ipcRenderer.invoke('clean:cancel'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onCleanLog: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('clean:log', handler);
    return () => ipcRenderer.removeListener('clean:log', handler);
  },
});

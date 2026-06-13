const { app, BrowserWindow, ipcMain, dialog, Notification, webcrypto } = require('electron');
const { APP_NAME, APP_SLUG, getIconPath } = require('./app-brand');
const mainI18n = require('./i18n');
global.crypto = webcrypto;

// Fixed userData folder — must run before account-store loads (see electron/data-path.js)
app.setName(APP_SLUG);

const path = require('path');
const fs = require('fs');
const accountStore = require('./account-store');
const { readCurrentTraeToken, getStoragePath } = require('./trae-reader');
const { switchTraeAccount, scanTraePath } = require('./trae-switcher');
const { getPlatformConfig } = require('./platform-config');
const { startBrowserLogin, closeBrowserLogin } = require('./browser-login');
const { TraeCleaner } = require('./trae-cleaner');
const { checkBeforeSwitch } = require('./switch-check');
const { isEncryptedBackup } = require('./backup-crypto');
const { setupTray, destroyTray } = require('./tray');

let mainWindow = null;
let storageWatcher = null;
let activeCleaner = null;
let trayApi = null;
let reloginAccountId = null;
let autoBackupTimer = null;
const notifiedKeys = new Set();

function notifyTraeAccountChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('trae:account-changed');
  }
  trayApi?.rebuild();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function sendNotification(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

function setupStorageWatcher() {
  try {
    const storagePath = getStoragePath();
    if (!fs.existsSync(storagePath)) return;

    if (storageWatcher) {
      fs.unwatchFile(storagePath);
      storageWatcher = null;
    }

    storageWatcher = storagePath;
    fs.watchFile(storagePath, { interval: 2000 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) notifyTraeAccountChanged();
    });
  } catch {
    /* ignore */
  }
}

function setupAutoBackupTimer() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }

  const settings = accountStore.getSettings();
  if (!settings.autoBackupEnabled) return;

  const ms = settings.autoBackupIntervalHours * 3600000;
  autoBackupTimer = setInterval(() => {
    try {
      accountStore.runAutoBackup();
    } catch {
      /* ignore */
    }
  }, ms);
}

function createWindow() {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: APP_NAME,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  mainWindow.webContents.on('did-finish-load', setupStorageWatcher);
  mainWindow.on('focus', notifyTraeAccountChanged);

  if (!trayApi) {
    trayApi = setupTray({
      getAccounts: () => accountStore.listAccounts(),
      onSwitch: async (id) => {
        try {
          await performSwitch(id);
          notifyTraeAccountChanged();
        } catch (err) {
          sendNotification('切换失败', err.message);
        }
      },
      onShowWindow: showMainWindow,
    });
  }
}

async function performSwitch(id) {
  const check = await checkBeforeSwitch(id);
  if (!check.canSwitch) throw new Error(check.blockers.join('；'));

  await accountStore.ensureValidToken(id);
  const account = accountStore.getAccount(id);
  const result = await switchTraeAccount(account);
  accountStore.setCurrentAccount(id);
  return { email: account.email, ...result, warnings: check.warnings };
}

function runCleanerWithLogs() {
  if (activeCleaner) throw new Error('清理正在进行中');

  return new Promise((resolve, reject) => {
    activeCleaner = new TraeCleaner((msg) => {
      mainWindow?.webContents.send('clean:log', msg);
    });

    activeCleaner
      .run()
      .then((result) => {
        activeCleaner = null;
        notifyTraeAccountChanged();
        resolve(result);
      })
      .catch((err) => {
        activeCleaner = null;
        reject(err);
      });
  });
}

app.whenReady().then(() => {
  const settings = accountStore.getSettings();
  mainI18n.setLocale(settings.language || mainI18n.detectLocale());
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getIconPath());
  }
  createWindow();
  setupAutoBackupTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMainWindow();
});

app.on('before-quit', () => {
  destroyTray();
  if (storageWatcher) fs.unwatchFile(storageWatcher);
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

function wrap(handler) {
  return async (_event, ...args) => {
    try {
      const data = await handler(...args);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  };
}

ipcMain.handle('accounts:list', wrap(() => accountStore.listAccounts()));
ipcMain.handle('accounts:refresh-expired', wrap(() => accountStore.refreshAllExpiredTokens()));
ipcMain.handle('accounts:refresh-token', wrap(({ id }) => accountStore.refreshAccountToken(id)));
ipcMain.handle('accounts:sync-trae', wrap(() => accountStore.syncCurrentFromTrae()));
ipcMain.handle('accounts:add', wrap(async ({ token, tokenExpiredAt }) =>
  accountStore.addAccountByToken(token, { tokenExpiredAt })));

ipcMain.handle('accounts:import-from-trae', wrap(async () => {
  const session = await readCurrentTraeToken();
  const config = getPlatformConfig();
  let machineId = null;
  if (config && fs.existsSync(config.machineIdPath)) {
    machineId = fs.readFileSync(config.machineIdPath, 'utf8').trim();
  }
  const account = await accountStore.addAccountByToken(session.token, {
    email: session.email,
    name: session.name,
    username: session.username,
    avatarUrl: session.avatarUrl,
    tokenExpiredAt: session.tokenExpiredAt,
    encryptedAuth: session.encryptedAuth,
    encryptedEntitlement: session.encryptedEntitlement,
    encryptedServerData: session.encryptedServerData,
    machineId,
  });
  return { account, source: session.source };
}));

ipcMain.handle('accounts:remove', wrap(({ id }) => accountStore.removeAccount(id)));

ipcMain.handle('accounts:update-meta', wrap(({ id, note, group }) => {
  accountStore.updateAccountMeta(id, { note, group });
  trayApi?.rebuild();
}));

ipcMain.handle('accounts:bind-machine', wrap(({ id }) => accountStore.bindMachineId(id)));
ipcMain.handle('accounts:regen-machine', wrap(({ id }) => accountStore.regenerateMachineId(id)));
ipcMain.handle('accounts:get-machine', wrap(() => ({
  current: accountStore.getCurrentMachineIdFromDisk(),
})));

ipcMain.handle('accounts:check-switch', wrap(({ id }) => checkBeforeSwitch(id)));

ipcMain.handle('accounts:export', wrap(async ({ ids, password } = {}) => {
  const payload = accountStore.exportAccountsData(ids);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: mainI18n.t('dialog.exportAccounts'),
    defaultPath: `${APP_SLUG}-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: mainI18n.t('dialog.backupFilter'), extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, accountStore.serializeExport(payload, password || ''), 'utf8');
  return { path: result.filePath, count: payload.accounts.length, encrypted: !!password };
}));

ipcMain.handle('accounts:pick-import-file', wrap(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mainI18n.t('importDialog.title'),
    filters: [{ name: mainI18n.t('dialog.backupFilter'), extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths[0]) return null;

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  let encrypted = false;
  try {
    encrypted = isEncryptedBackup(JSON.parse(content));
  } catch {
    throw new Error('无法解析备份文件');
  }

  return {
    fileName: path.basename(filePath),
    content,
    encrypted,
  };
}));

ipcMain.handle('accounts:import-content', wrap(async ({ content, mode, password } = {}) => {
  if (!content) throw new Error('未选择备份文件');
  const parsed = accountStore.parseImportFileContent(content, password || '');
  return accountStore.importAccounts(parsed, mode || 'skip');
}));

ipcMain.handle('accounts:switch', wrap(async ({ id, skipCheck }) => {
  if (!skipCheck) {
    const check = await checkBeforeSwitch(id);
    if (!check.canSwitch) throw new Error(check.blockers.join('；'));
  }
  return performSwitch(id);
}));

ipcMain.handle('accounts:clean-and-switch', wrap(async ({ id }) => {
  const check = await checkBeforeSwitch(id);
  if (!check.canSwitch) throw new Error(check.blockers.join('；'));

  const cleanResult = await runCleanerWithLogs();
  if (!cleanResult.success) throw new Error('清理未完成');

  return performSwitch(id);
}));

ipcMain.handle('accounts:get-usage-history', wrap(() => accountStore.getUsageHistoryForOverview()));

ipcMain.handle('accounts:notify-check', wrap(async () => {
  const settings = accountStore.getSettings();
  const accounts = await accountStore.listAccounts();
  const alerts = [];

  for (const a of accounts) {
    if (!settings.notifyTokenExpiry) continue;
    if (a.tokenExpired) {
      const key = `expired:${a.id}`;
      if (!notifiedKeys.has(key)) {
        alerts.push({ type: 'expired', accountId: a.id, email: a.email, message: 'Token 已过期' });
        notifiedKeys.add(key);
      }
    } else if (a.tokenExpiringSoon) {
      const key = `expiring:${a.id}`;
      if (!notifiedKeys.has(key)) {
        alerts.push({ type: 'expiring', accountId: a.id, email: a.email, message: 'Token 即将过期' });
        notifiedKeys.add(key);
      }
    }
  }

  return alerts;
}));

ipcMain.handle('settings:get-trae-path', wrap(() => accountStore.getTraePath()));
ipcMain.handle('settings:set-trae-path', wrap(({ traePath }) => {
  if (!fs.existsSync(traePath)) throw new Error('路径不存在');
  accountStore.setTraePath(traePath);
  return traePath;
}));
ipcMain.handle('settings:scan-trae-path', wrap(() => scanTraePath()));
ipcMain.handle('settings:pick-trae-path', wrap(async () => {
  const config = getPlatformConfig();
  if (!config) throw new Error('当前平台不支持');

  const filters =
    process.platform === 'darwin'
      ? [{ name: 'Application', extensions: ['app'] }]
      : [{ name: 'Executable', extensions: ['exe'] }];

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Trae IDE',
    properties: process.platform === 'darwin' ? ['openDirectory'] : ['openFile'],
    filters,
  });

  if (result.canceled || !result.filePaths[0]) return null;
  accountStore.setTraePath(result.filePaths[0]);
  return result.filePaths[0];
}));

ipcMain.handle('settings:pick-backup-dir', wrap(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择自动备份目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}));

ipcMain.handle('settings:run-backup-now', wrap(() => accountStore.runAutoBackup()));
ipcMain.handle('settings:last-backup', wrap(() => accountStore.getLastAutoBackupAt()));

ipcMain.handle('settings:platform', wrap(() => {
  const config = getPlatformConfig();
  return config ? { platform: config.platform, label: config.label } : null;
}));

ipcMain.handle('accounts:get-usage', wrap(async ({ id }) => {
  const summary = await accountStore.getAccountUsage(id);
  const settings = accountStore.getSettings();
  const account = accountStore.getAccount(id);

  if (settings.notifyLowQuota && summary) {
    const limit = summary.displayLimit ?? 0;
    const left = summary.displayLeft ?? 0;
    const pctLeft = limit > 0 ? (left / limit) * 100 : 0;
    if (pctLeft <= settings.lowQuotaThreshold && pctLeft >= 0) {
      const key = `low:${id}:${Math.floor(pctLeft)}`;
      if (!notifiedKeys.has(key)) {
        sendNotification('用量提醒', `${account.email || account.name} 剩余用量较低`);
        notifiedKeys.add(key);
      }
    }
  }

  return summary;
}));

ipcMain.handle('accounts:start-browser-login', wrap(async ({ accountId } = {}) => {
  reloginAccountId = accountId || null;
  startBrowserLogin({
    parentWindow: mainWindow,
    onSuccess: async (token, cookies, expiredAt) => {
      const extras = { cookies, tokenExpiredAt: expiredAt || undefined };
      if (reloginAccountId) {
        const account = await accountStore.updateAccountToken(reloginAccountId, token, extras);
        reloginAccountId = null;
        trayApi?.rebuild();
        return account;
      }
      const account = await accountStore.addAccountByToken(token, extras);
      trayApi?.rebuild();
      return account;
    },
    onFailed: () => {},
    onCancelled: () => {
      reloginAccountId = null;
    },
  });
  return { started: true, relogin: !!accountId };
}));

ipcMain.handle('accounts:refresh-profiles', wrap(() => accountStore.refreshAllProfiles()));
ipcMain.handle('accounts:cancel-browser-login', wrap(() => {
  closeBrowserLogin();
  reloginAccountId = null;
}));

ipcMain.handle('settings:get-app', wrap(() => accountStore.getSettings()));
ipcMain.handle('settings:save-app', wrap((settings) => {
  const next = accountStore.saveSettings(settings || {});
  if (next.language) mainI18n.setLocale(next.language);
  setupAutoBackupTimer();
  return next;
}));

ipcMain.handle('clean:scan', wrap(async () => {
  const cleaner = new TraeCleaner(() => {});
  return cleaner.scan();
}));

ipcMain.handle('clean:start', async () => {
  if (activeCleaner) return { ok: false, error: '清理正在进行中' };
  try {
    const data = await runCleanerWithLogs();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clean:cancel', () => {
  if (activeCleaner) {
    activeCleaner.cancel();
    return { ok: true };
  }
  return { ok: false };
});

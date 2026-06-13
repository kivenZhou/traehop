const Store = require('electron-store');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  validateToken,
  resolveUserProfile,
  getUsageSummary,
  getUserToken,
  isTokenExpired,
  isAccountTokenExpired,
  isAccountTokenExpiringSoon,
  parseJwtPayload,
  cleanCookies,
  resolveExpiredAt,
} = require('./trae-api');
const { encryptPayload, decryptPayload, isEncryptedBackup } = require('./backup-crypto');
const { ensureDataDir } = require('./data-path');
const { DATA_STORE_NAME, BACKUP_FORMAT } = require('./app-brand');

const storeCwd = ensureDataDir();
const store = new Store({ name: DATA_STORE_NAME, cwd: storeCwd });
const MAX_USAGE_HISTORY = 200;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  language: null,
  autoRefreshEnabled: false,
  autoRefreshIntervalMinutes: 5,
  notifyLowQuota: false,
  notifyTokenExpiry: true,
  lowQuotaThreshold: 10,
  disclaimerAccepted: false,
  disclaimerAcceptedAt: null,
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  autoBackupDir: '',
};

function getSettings() {
  const saved = store.get('settings', {});
  const interval = Math.max(5, Number(saved.autoRefreshIntervalMinutes) || 5);
  return {
    theme: saved.theme === 'light' ? 'light' : 'dark',
    language: saved.language === 'en' ? 'en' : saved.language === 'zh' ? 'zh' : null,
    autoRefreshEnabled: !!saved.autoRefreshEnabled,
    autoRefreshIntervalMinutes: interval,
    notifyLowQuota: !!saved.notifyLowQuota,
    notifyTokenExpiry: saved.notifyTokenExpiry !== false,
    disclaimerAccepted: !!saved.disclaimerAccepted,
    disclaimerAcceptedAt: saved.disclaimerAcceptedAt || null,
    lowQuotaThreshold: Math.max(1, Number(saved.lowQuotaThreshold) || 10),
    autoBackupEnabled: !!saved.autoBackupEnabled,
    autoBackupIntervalHours: Math.max(1, Number(saved.autoBackupIntervalHours) || 24),
    autoBackupDir: saved.autoBackupDir || '',
  };
}

function saveSettings(partial) {
  const current = getSettings();
  const next = { ...current, ...partial };
  if (next.autoRefreshIntervalMinutes < 5) next.autoRefreshIntervalMinutes = 5;
  if (next.autoBackupIntervalHours < 1) next.autoBackupIntervalHours = 1;
  store.set('settings', next);
  return next;
}

function getStore() {
  const data = store.get('accounts', { accounts: [], currentAccountId: null });
  if (!data.accounts) data.accounts = [];
  return data;
}

function saveStore(data) {
  store.set('accounts', data);
}

function getUsageHistory() {
  return store.get('usageHistory', []);
}

function saveUsageHistory(history) {
  store.set('usageHistory', history.slice(-MAX_USAGE_HISTORY));
}

function toBrief(account, traeUserId) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    avatarUrl: account.avatarUrl,
    region: account.region,
    group: account.group || '',
    note: account.note || '',
    machineId: account.machineId || null,
    isCurrent: !!(traeUserId && account.userId === traeUserId),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt || account.createdAt,
    tokenExp: account.tokenExp || null,
    tokenExpiredAt: account.tokenExpiredAt || null,
    tokenExpired: isAccountTokenExpired(account),
    tokenExpiringSoon: isAccountTokenExpiringSoon(account),
    hasCookies: !!(account.cookies && account.cookies.trim()),
  };
}

function applyTokenExpiryFields(account, token, expiredAt, { resetIfMissing = false } = {}) {
  try {
    account.tokenExp = parseJwtPayload(token).exp || null;
  } catch {
    account.tokenExp = null;
  }
  const resolved = resolveExpiredAt(token, expiredAt);
  if (resolved) {
    account.tokenExpiredAt = resolved;
  } else if (resetIfMissing) {
    account.tokenExpiredAt = null;
  }
}

function applyTokenRefresh(account, result) {
  if (result.userId && account.userId && result.userId !== account.userId) {
    throw new Error('Cookie 对应的用户与当前账号不匹配');
  }
  account.token = result.token;
  applyTokenExpiryFields(account, result.token, result.expiredAt, { resetIfMissing: true });
  account.updatedAt = Date.now();
}

async function enrichSessionFromCookies(account) {
  if (!account.cookies?.trim()) return false;
  try {
    const result = await getUserToken(account.cookies);
    if (result.userId && account.userId && result.userId !== account.userId) return false;
    account.token = result.token || account.token;
    applyTokenExpiryFields(account, account.token, result.expiredAt, { resetIfMissing: true });
    return true;
  } catch {
    return false;
  }
}

function isTokenExpiringSoon(account) {
  return isAccountTokenExpiringSoon(account);
}

async function getTraeActiveUserId() {
  try {
    const { readCurrentTraeToken } = require('./trae-reader');
    const session = await readCurrentTraeToken();
    if (session.userId) return session.userId;
    if (session.token) return parseJwtPayload(session.token).userId || null;
  } catch {
    /* Trae 未登录或无法读取 */
  }
  return null;
}

async function syncCurrentFromTrae() {
  const data = getStore();
  const traeUserId = await getTraeActiveUserId();

  if (!traeUserId) {
    if (data.currentAccountId !== null) {
      data.currentAccountId = null;
      saveStore(data);
    }
    return { traeUserId: null, matchedAccountId: null };
  }

  const match = data.accounts.find((a) => a.userId === traeUserId);
  const matchedAccountId = match?.id || null;

  if (data.currentAccountId !== matchedAccountId) {
    data.currentAccountId = matchedAccountId;
    saveStore(data);
  }

  return { traeUserId, matchedAccountId };
}

function buildAccountFromItem(item, info, trimmed) {
  return {
    id: crypto.randomUUID(),
    name: item.name || info?.name || item.email || `User_${String(item.userId).slice(0, 8)}`,
    email: item.email || info?.email || '',
    avatarUrl: item.avatarUrl || info?.avatarUrl || '',
    token: trimmed || item.token,
    userId: item.userId || info?.userId,
    tenantId: item.tenantId || info?.tenantId || '',
    region: item.region || info?.region || '',
    machineId: item.machineId || null,
    encryptedAuth: item.encryptedAuth || null,
    encryptedEntitlement: item.encryptedEntitlement || null,
    encryptedServerData: item.encryptedServerData || null,
    tokenExp: item.tokenExp || info?.tokenExp || null,
    tokenExpiredAt: item.tokenExpiredAt || info?.tokenExpiredAt || null,
    cookies: cleanCookies(item.cookies || ''),
    group: item.group || '',
    note: item.note || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function applyItemToAccount(account, item, info, trimmed) {
  account.name = item.name || info?.name || account.name;
  account.email = item.email || info?.email || account.email;
  account.avatarUrl = item.avatarUrl || info?.avatarUrl || account.avatarUrl;
  account.token = trimmed || item.token;
  account.tenantId = item.tenantId || info?.tenantId || account.tenantId;
  account.region = item.region || info?.region || account.region;
  if (item.machineId) account.machineId = item.machineId;
  if (item.encryptedAuth) account.encryptedAuth = item.encryptedAuth;
  if (item.encryptedEntitlement) account.encryptedEntitlement = item.encryptedEntitlement;
  if (item.encryptedServerData) account.encryptedServerData = item.encryptedServerData;
  account.tokenExp = item.tokenExp || info?.tokenExp || account.tokenExp;
  if (item.tokenExpiredAt || info?.tokenExpiredAt) {
    account.tokenExpiredAt = item.tokenExpiredAt || info.tokenExpiredAt;
  }
  if (item.cookies) {
    account.cookies = cleanCookies(item.cookies);
  }
  if (item.group !== undefined) account.group = item.group;
  if (item.note !== undefined) account.note = item.note;
  account.updatedAt = Date.now();
}

async function addAccountByToken(token, extras = {}) {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token 不能为空');

  const info = await validateToken(trimmed, extras);
  const data = getStore();

  if (data.accounts.some((a) => a.userId === info.userId)) {
    throw new Error('该账号已存在');
  }

  const account = buildAccountFromItem(
    {
      name: extras.name || extras.username,
      email: extras.email,
      avatarUrl: extras.avatarUrl,
      machineId: extras.machineId,
      encryptedAuth: extras.encryptedAuth,
      encryptedEntitlement: extras.encryptedEntitlement,
      encryptedServerData: extras.encryptedServerData,
      userId: info.userId,
      tenantId: info.tenantId,
      region: info.region,
      tokenExp: info.tokenExp,
      tokenExpiredAt: extras.tokenExpiredAt,
      cookies: extras.cookies,
    },
    info,
    trimmed
  );

  data.accounts.push(account);
  if (account.cookies) await enrichSessionFromCookies(account);
  saveStore(data);
  return toBrief(account, (await syncCurrentFromTrae()).traeUserId);
}

async function updateAccountToken(id, token, extras = {}) {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token 不能为空');

  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');

  const info = await validateToken(trimmed, extras);
  if (info.userId !== account.userId) {
    throw new Error('登录账号与当前记录不一致，请确认使用同一账号登录');
  }

  account.token = trimmed;
  account.name = info.name || extras.name || account.name;
  account.email = info.email || extras.email || account.email;
  account.avatarUrl = info.avatarUrl || extras.avatarUrl || account.avatarUrl;
  account.region = info.region || account.region;
  applyTokenExpiryFields(account, trimmed, extras.tokenExpiredAt);
  if (extras.cookies) account.cookies = cleanCookies(extras.cookies);
  await enrichSessionFromCookies(account);
  account.updatedAt = Date.now();
  saveStore(data);

  const { traeUserId } = await syncCurrentFromTrae();
  return toBrief(account, traeUserId);
}

async function refreshAccountToken(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');
  if (!account.cookies) throw new Error('没有保存的 Cookie，请使用浏览器续登');

  const result = await getUserToken(account.cookies);
  applyTokenRefresh(account, result);
  saveStore(data);

  const { traeUserId } = await syncCurrentFromTrae();
  const brief = toBrief(account, traeUserId);
  return { ...brief, stillExpiringSoon: brief.tokenExpiringSoon };
}

async function ensureValidToken(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');
  if (!account.token) throw new Error('账号没有有效的 Token');
  if (!isTokenExpired(account.token)) return account.token;
  if (!account.cookies) throw new Error('Token 已过期且无 Cookie，请续登');

  const result = await getUserToken(account.cookies);
  applyTokenRefresh(account, result);
  saveStore(data);
  return account.token;
}

async function refreshAllExpiredTokens() {
  const data = getStore();
  let refreshed = 0;
  let failed = 0;

  for (const account of data.accounts) {
    if (!account.token || !account.cookies || !isTokenExpired(account.token)) continue;
    try {
      const result = await getUserToken(account.cookies);
      applyTokenRefresh(account, result);
      refreshed += 1;
    } catch {
      failed += 1;
    }
  }

  let synced = 0;
  for (const account of data.accounts) {
    if (!account.cookies?.trim() || !isAccountTokenExpiringSoon(account)) continue;
    try {
      await enrichSessionFromCookies(account);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  if (refreshed > 0 || synced > 0) saveStore(data);
  return { refreshed, synced, failed };
}

async function listAccounts() {
  const { traeUserId } = await syncCurrentFromTrae();
  const data = getStore();
  return data.accounts.map((a) => toBrief(a, traeUserId));
}

function getAccount(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');
  return account;
}

function updateAccountMeta(id, { note, group } = {}) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');
  if (note !== undefined) account.note = String(note).slice(0, 200);
  if (group !== undefined) account.group = String(group).slice(0, 50);
  account.updatedAt = Date.now();
  saveStore(data);
  return account;
}

function getCurrentMachineIdFromDisk() {
  const { getPlatformConfig } = require('./platform-config');
  const config = getPlatformConfig();
  if (!config || !fs.existsSync(config.machineIdPath)) return null;
  return fs.readFileSync(config.machineIdPath, 'utf8').trim();
}

function bindMachineId(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');

  const machineId = getCurrentMachineIdFromDisk();
  if (!machineId) throw new Error('未找到当前 Trae 设备标识，请先在 Trae 中登录或执行清理');

  account.machineId = machineId;
  account.updatedAt = Date.now();
  saveStore(data);
  return { machineId };
}

function regenerateMachineId(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) throw new Error('账号不存在');

  account.machineId = crypto.randomUUID();
  account.updatedAt = Date.now();
  saveStore(data);
  return { machineId: account.machineId };
}

function removeAccount(id) {
  const data = getStore();
  const idx = data.accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('账号不存在');

  data.accounts.splice(idx, 1);
  if (data.currentAccountId === id) data.currentAccountId = null;
  saveStore(data);
}

function setCurrentAccount(id) {
  const data = getStore();
  if (!data.accounts.some((a) => a.id === id)) throw new Error('账号不存在');
  data.currentAccountId = id;
  saveStore(data);
}

function getTraePath() {
  return store.get('traePath', '');
}

function setTraePath(p) {
  store.set('traePath', p);
}

async function getAccountUsage(id) {
  await ensureValidToken(id);
  let account = getAccount(id);
  if (!account.token) throw new Error('账号没有有效的 Token');

  let summary;
  try {
    summary = await getUsageSummary(account.token);
  } catch (err) {
    const msg = err.message || '';
    if (account.cookies && (msg.includes('401') || msg.includes('过期'))) {
      await refreshAccountToken(id);
      account = getAccount(id);
      summary = await getUsageSummary(account.token);
    } else {
      throw err;
    }
  }

  recordUsageSnapshot(account, summary);
  return summary;
}

function recordUsageSnapshot(account, summary) {
  if (!summary) return;
  const history = getUsageHistory();
  history.push({
    accountId: account.id,
    email: account.email || account.name,
    used: summary.displayUsed ?? 0,
    limit: summary.displayLimit ?? 0,
    left: summary.displayLeft ?? 0,
    planType: summary.planType || '',
    isDollarBilling: !!summary.isDollarBilling,
    timestamp: Date.now(),
  });
  saveUsageHistory(history);
}

function getUsageHistoryForOverview(limit = 50) {
  return getUsageHistory().slice(-limit).reverse();
}

async function refreshAccountProfile(id) {
  const data = getStore();
  const account = data.accounts.find((a) => a.id === id);
  if (!account?.token) throw new Error('账号不存在');

  const profile = await resolveUserProfile(account.token, {
    email: account.email,
    name: account.name,
    avatarUrl: account.avatarUrl,
    region: account.region,
  });

  account.name = profile.name || account.name;
  account.email = profile.email || account.email;
  account.avatarUrl = profile.avatarUrl || account.avatarUrl;
  account.region = profile.region || account.region;
  account.updatedAt = Date.now();
  saveStore(data);

  const { traeUserId } = await syncCurrentFromTrae();
  return toBrief(account, traeUserId);
}

async function refreshAllProfiles() {
  const data = getStore();
  const results = await Promise.allSettled(
    data.accounts
      .filter((a) => a.token && (!a.email || !a.email.includes('@')))
      .map((a) => refreshAccountProfile(a.id))
  );
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

const EXPORT_FIELDS = [
  'name', 'email', 'avatarUrl', 'token', 'cookies', 'userId', 'tenantId', 'region',
  'machineId', 'encryptedAuth', 'encryptedEntitlement', 'encryptedServerData',
  'tokenExp', 'tokenExpiredAt', 'group', 'note',
];

function pickExportFields(account) {
  const out = {};
  for (const key of EXPORT_FIELDS) {
    if (account[key] !== undefined && account[key] !== null && account[key] !== '') {
      out[key] = account[key];
    }
  }
  return out;
}

function exportAccountsData(ids = null) {
  const data = getStore();
  let accounts = data.accounts;
  if (ids?.length) {
    const set = new Set(ids);
    accounts = accounts.filter((a) => set.has(a.id));
  }
  if (!accounts.length) throw new Error('没有可导出的账号');

  return {
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map(pickExportFields),
  };
}

function serializeExport(payload, password) {
  const json = JSON.stringify(payload, null, 2);
  if (password) return JSON.stringify(encryptPayload(json, password), null, 2);
  return json;
}

function parseImportPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.accounts)) return raw.accounts;
  throw new Error('无效的备份文件格式');
}

function parseImportFileContent(text, password) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('无法解析备份文件');
  }

  if (isEncryptedBackup(raw)) {
    const plain = decryptPayload(raw, password);
    raw = JSON.parse(plain);
  }

  return raw;
}

async function importAccounts(raw, mode = 'skip') {
  const items = parseImportPayload(raw);
  const data = getStore();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item?.token || !item?.userId) {
      skipped += 1;
      continue;
    }

    const existing = data.accounts.find((a) => a.userId === item.userId);

    if (existing) {
      if (mode === 'skip') {
        skipped += 1;
        continue;
      }
      if (mode === 'overwrite') {
        try {
          let token = item.token.trim();
          if (isTokenExpired(token) && item.cookies) {
            try {
              const refreshed = await getUserToken(item.cookies);
              token = refreshed.token;
              item.tokenExp = refreshed.tokenExp;
              item.tokenExpiredAt = refreshed.expiredAt;
            } catch {
              /* 使用原 token 继续验证 */
            }
          }
          const info = await validateToken(token, item);
          applyItemToAccount(existing, { ...item, token }, info, token);
          updated += 1;
        } catch {
          skipped += 1;
        }
        continue;
      }
    }

    try {
      let token = item.token.trim();
      if (isTokenExpired(token) && item.cookies) {
        try {
          const refreshed = await getUserToken(item.cookies);
          token = refreshed.token;
          item.tokenExp = refreshed.tokenExp;
          item.tokenExpiredAt = refreshed.expiredAt;
        } catch {
          /* 使用原 token 继续验证 */
        }
      }
      const info = await validateToken(token, item);
      data.accounts.push(buildAccountFromItem({ ...item, token }, info, token));
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  saveStore(data);
  return { imported, updated, skipped, total: data.accounts.length };
}

function runAutoBackup() {
  const settings = getSettings();
  if (!settings.autoBackupEnabled || !settings.autoBackupDir) {
    return { skipped: true, reason: '未启用或未设置目录' };
  }

  if (!fs.existsSync(settings.autoBackupDir)) {
    fs.mkdirSync(settings.autoBackupDir, { recursive: true });
  }

  const payload = exportAccountsData();
  const filename = `${BACKUP_FORMAT}-auto-${new Date().toISOString().slice(0, 10)}.json`;
  const filePath = path.join(settings.autoBackupDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  store.set('lastAutoBackupAt', Date.now());
  return { path: filePath, count: payload.accounts.length };
}

function getLastAutoBackupAt() {
  return store.get('lastAutoBackupAt', null);
}

module.exports = {
  addAccountByToken,
  updateAccountToken,
  refreshAccountToken,
  ensureValidToken,
  refreshAllExpiredTokens,
  listAccounts,
  getAccount,
  removeAccount,
  setCurrentAccount,
  syncCurrentFromTrae,
  updateAccountMeta,
  bindMachineId,
  regenerateMachineId,
  getCurrentMachineIdFromDisk,
  getTraePath,
  setTraePath,
  getAccountUsage,
  recordUsageSnapshot,
  getUsageHistoryForOverview,
  refreshAccountProfile,
  refreshAllProfiles,
  exportAccountsData,
  serializeExport,
  parseImportFileContent,
  importAccounts,
  runAutoBackup,
  getLastAutoBackupAt,
  getSettings,
  saveSettings,
  isTokenExpiringSoon,
};

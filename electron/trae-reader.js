const fs = require('fs');
const path = require('path');
const { getPlatformConfig } = require('./platform-config');
const { decryptString } = require('./trae-byte-crypto');
const { decryptForTrae } = require('./trae-crypt');
const { AUTH_KEY } = require('./trae-switcher');

const ENTITLEMENT_KEY = 'iCubeEntitlementInfo://icube.cloudide';
const SERVER_KEY = 'iCubeServerData://icube.cloudide';

function getStoragePath() {
  const config = getPlatformConfig();
  if (!config) throw new Error('仅支持 macOS 和 Windows');
  return path.join(config.appSupportBase, 'User', 'globalStorage', 'storage.json');
}

async function decryptStorageValue(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('空数据');
  if (raw.trim().startsWith('{')) return raw;

  if (raw.startsWith('dGMF')) {
    return decryptString(raw);
  }

  if (raw.startsWith('djEw')) {
    return decryptForTrae(raw);
  }

  throw new Error('不支持的加密格式');
}

async function parseAuthRaw(raw) {
  const text = await decryptStorageValue(raw);
  const info = JSON.parse(text);
  if (!info.token) throw new Error('登录信息中没有 token');
  const account = info.account || {};
  return {
    token: info.token,
    email: account.email || '',
    username: account.username || '',
    name: account.username || account.email || '',
    avatarUrl: account.avatar_url || '',
    userId: info.userId || '',
    tokenExpiredAt: info.expiredAt || null,
    authJson: text,
  };
}

async function readFromStorage() {
  const storagePath = getStoragePath();
  if (!fs.existsSync(storagePath)) {
    throw new Error('未找到 Trae 配置文件，请先在 Trae IDE 中登录');
  }

  const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const rawAuth = data[AUTH_KEY];
  if (!rawAuth) throw new Error('Trae 中未找到登录信息，请先登录');

  const parsed = await parseAuthRaw(rawAuth);
  return {
    ...parsed,
    source: 'storage.json',
    encryptedAuth: typeof rawAuth === 'string' && rawAuth.startsWith('dGMF') ? rawAuth : null,
    encryptedEntitlement:
      typeof data[ENTITLEMENT_KEY] === 'string' && data[ENTITLEMENT_KEY].startsWith('dGMF')
        ? data[ENTITLEMENT_KEY]
        : null,
    encryptedServerData:
      typeof data[SERVER_KEY] === 'string' && data[SERVER_KEY].startsWith('dGMF')
        ? data[SERVER_KEY]
        : null,
  };
}

function readTokenFromLogs() {
  const config = getPlatformConfig();
  const logsDir = path.join(config.appSupportBase, 'logs');
  if (!fs.existsSync(logsDir)) return null;

  const logFiles = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(logsDir, d.name, 'main.log'))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const jwtPattern = /"UserJwt":"(eyJ[^"]+)"/g;

  for (const logFile of logFiles) {
    const content = fs.readFileSync(logFile, 'utf8');
    let match;
    let last = null;
    while ((match = jwtPattern.exec(content)) !== null) {
      last = match[1];
    }
    if (last) {
      return { token: last, source: path.basename(path.dirname(logFile)) + '/main.log' };
    }
  }

  return null;
}

async function readCurrentTraeToken() {
  try {
    return await readFromStorage();
  } catch (err) {
    const fromLog = readTokenFromLogs();
    if (fromLog) return fromLog;
    throw err;
  }
}

module.exports = { readCurrentTraeToken, readFromStorage, getStoragePath };

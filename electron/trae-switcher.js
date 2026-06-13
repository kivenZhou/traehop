const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { getPlatformConfig } = require('./platform-config');
const { getTraePath } = require('./account-store');
const { encryptString } = require('./trae-byte-crypto');

const AUTH_PROVIDER_ID = 'icube.cloudide';
const AUTH_KEY = `iCubeAuthInfo://${AUTH_PROVIDER_ID}`;
const ENTITLEMENT_KEY = `iCubeEntitlementInfo://${AUTH_PROVIDER_ID}`;
const SERVER_KEY = `iCubeServerData://${AUTH_PROVIDER_ID}`;

function generateMachineId() {
  return crypto.randomUUID();
}

function md5TelemetryId(input) {
  const h1 = crypto.createHash('sha256').update(input).digest();
  const h2 = crypto.createHash('sha256').update(input + h1.toString('hex')).digest();
  const combined = Buffer.concat([h1.subarray(0, 8), h2.subarray(0, 8)]);
  return combined.toString('hex');
}

function getTraeDataPath() {
  const config = getPlatformConfig();
  if (!config) throw new Error('仅支持 macOS 和 Windows');
  return config.appSupportBase;
}

function isTraeRunning() {
  if (process.platform === 'darwin') {
    try {
      execSync('pgrep -f "Trae.app/Contents/MacOS"', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
  if (process.platform === 'win32') {
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq Trae.exe" /NH', { encoding: 'utf8' });
      return out.includes('Trae.exe');
    } catch {
      return false;
    }
  }
  return false;
}

function killTrae() {
  if (!isTraeRunning()) return;

  if (process.platform === 'darwin') {
    try {
      execSync('osascript -e \'tell application "Trae" to quit\'', { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    execSync('sleep 1.5');
    if (isTraeRunning()) {
      try {
        execSync('pkill -9 -f "Trae.app/Contents/MacOS"', { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
  } else if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM Trae.exe', { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    try {
      execSync('timeout /t 1 /nobreak', { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    if (isTraeRunning()) {
      execSync('taskkill /F /IM Trae.exe', { stdio: 'ignore' });
    }
  }

  if (isTraeRunning()) {
    throw new Error('无法关闭 Trae IDE，请手动关闭后重试');
  }
}

function removeIfExists(targetPath, isDir = false) {
  if (!fs.existsSync(targetPath)) return;
  if (isDir) fs.rmSync(targetPath, { recursive: true, force: true });
  else fs.unlinkSync(targetPath);
}

function buildUserInfo(account) {
  const now = new Date();
  const expiredAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const refreshExpiredAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const region = (account.region || 'SG').toUpperCase();
  const host =
    region === 'CN'
      ? 'https://api.trae.com.cn'
      : region === 'US'
        ? 'https://api-us-east.trae.ai'
        : 'https://api-sg-central.trae.ai';

  const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');

  return {
    token: account.token,
    refreshToken: account.refreshToken || '',
    expiredAt: fmt(expiredAt),
    refreshExpiredAt: fmt(refreshExpiredAt),
    tokenReleaseAt: fmt(now),
    userId: account.userId,
    host,
    userRegion: { region, _aiRegion: region },
    account: {
      username: account.name,
      iss: '',
      iat: 0,
      organization: '',
      work_country: '',
      email: account.email,
      avatar_url: account.avatarUrl || '',
      description: '',
      scope: 'marscode',
      loginScope: 'trae',
      storeCountryCode: 'cn',
      storeCountrySrc: 'uid',
      storeRegion: region,
      userTag: 'row',
    },
  };
}

function buildEntitlementInfo() {
  return {
    identityStr: 'Free',
    identity: 0,
    isPayFreshman: false,
    isSupportCommercialization: true,
    hasPackage: false,
    enableEntitlement: true,
    detail: {
      can_gen_solo_code: false,
      fast_request_per: 1,
      in_wait: false,
      permission: 1,
      toast_read: false,
      toastRead: false,
      canGenSoloCode: false,
      fastRequestPer: 1,
      inWaitlist: false,
    },
  };
}

async function writeTraeLoginInfo(traePath, account) {
  const storageDir = path.join(traePath, 'User', 'globalStorage');
  fs.mkdirSync(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, 'storage.json');

  let json = {};
  if (fs.existsSync(storagePath)) {
    try {
      json = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {
      json = {};
    }
  }

  if (account.encryptedAuth && account.encryptedAuth.startsWith('dGMF')) {
    json[AUTH_KEY] = account.encryptedAuth;
  } else {
    const userInfo = buildUserInfo(account);
    json[AUTH_KEY] = await encryptString(JSON.stringify(userInfo));
  }

  if (account.encryptedEntitlement && account.encryptedEntitlement.startsWith('dGMF')) {
    json[ENTITLEMENT_KEY] = account.encryptedEntitlement;
  } else {
    json[ENTITLEMENT_KEY] = await encryptString(JSON.stringify(buildEntitlementInfo()));
  }

  if (account.encryptedServerData) {
    json[SERVER_KEY] = account.encryptedServerData;
  }

  fs.writeFileSync(storagePath, JSON.stringify(json, null, 2), 'utf8');
}

function resolveTraeAppPath() {
  const saved = getTraePath();
  if (saved && fs.existsSync(saved)) return saved;

  const config = getPlatformConfig();
  if (!config) throw new Error('未设置 Trae IDE 路径');

  if (process.platform === 'darwin') {
    const candidates = [
      config.defaultTraeApp,
      path.join(require('os').homedir(), 'Applications/Trae.app'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  if (saved) throw new Error('Trae IDE 路径无效，请在设置中重新配置');
  throw new Error('未找到 Trae IDE，请在设置中配置路径');
}

function openTrae() {
  const appPath = resolveTraeAppPath();
  if (process.platform === 'darwin') {
    spawn('open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn(appPath, [], { detached: true, stdio: 'ignore' }).unref();
  }
}

function clearLoginCache(traePath) {
  const globalStorage = path.join(traePath, 'User', 'globalStorage');
  removeIfExists(path.join(globalStorage, 'state.vscdb.backup'));
  removeIfExists(path.join(traePath, 'Cookies-journal'));
  removeIfExists(path.join(traePath, 'Network', 'Cookies-journal'));
}

async function switchTraeAccount(account) {
  killTrae();

  const traePath = getTraeDataPath();
  const machineId = account.machineId || generateMachineId();

  fs.writeFileSync(path.join(traePath, 'machineid'), machineId, 'utf8');
  clearLoginCache(traePath);

  const globalStorage = path.join(traePath, 'User', 'globalStorage');
  fs.mkdirSync(globalStorage, { recursive: true });
  const storagePath = path.join(globalStorage, 'storage.json');

  let json = {};
  if (fs.existsSync(storagePath)) {
    try {
      json = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {
      json = {};
    }
  }

  delete json['iCubeAuthInfo://usertag'];

  json['telemetry.machineId'] = md5TelemetryId(machineId);
  json['telemetry.sqmId'] = `{${generateMachineId().toUpperCase()}}`;
  json['telemetry.devDeviceId'] = generateMachineId();

  fs.writeFileSync(storagePath, JSON.stringify(json, null, 2), 'utf8');
  await writeTraeLoginInfo(traePath, account);

  execSync('sleep 0.5');

  try {
    openTrae();
  } catch (err) {
    console.warn('自动打开 Trae 失败:', err.message);
  }

  return { machineId };
}

function scanTraePath() {
  const config = getPlatformConfig();
  if (!config) throw new Error('当前平台不支持');

  if (process.platform === 'darwin') {
    const candidates = [
      config.defaultTraeApp,
      path.join(require('os').homedir(), 'Applications/Trae.app'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('未找到 Trae.app，请手动选择');
  }

  if (process.platform === 'win32' && fs.existsSync(config.defaultTraeApp)) {
    return config.defaultTraeApp;
  }

  throw new Error('请手动设置 Trae IDE 路径');
}

module.exports = {
  switchTraeAccount,
  scanTraePath,
  getTraeDataPath,
  isTraeRunning,
  AUTH_KEY,
};

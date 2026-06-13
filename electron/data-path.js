const path = require('path');
const fs = require('fs');
const os = require('os');
const { APP_SLUG, DATA_STORE_NAME } = require('./app-brand');

const STABLE_DIR_NAME = APP_SLUG;
const DATA_FILE_NAME = `${DATA_STORE_NAME}.json`;

function getAppSupportRoot() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return path.join(os.homedir(), '.config');
}

function getStableDataDir() {
  return path.join(getAppSupportRoot(), STABLE_DIR_NAME);
}

function getStableDataFilePath() {
  return path.join(getStableDataDir(), DATA_FILE_NAME);
}

function ensureDataDir() {
  const stableDir = getStableDataDir();
  if (!fs.existsSync(stableDir)) {
    fs.mkdirSync(stableDir, { recursive: true });
  }
  return stableDir;
}

module.exports = {
  STABLE_DIR_NAME,
  DATA_FILE_NAME,
  getAppSupportRoot,
  getStableDataDir,
  getStableDataFilePath,
  ensureDataDir,
};

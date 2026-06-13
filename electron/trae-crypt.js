const { execSync } = require('child_process');
const crypto = require('crypto');

const SERVICE = 'Trae Safe Storage';
const ACCOUNT = 'Trae Key';
const V10_PREFIX = 'v10';

function getKeychainPassword() {
  return execSync(
    `security find-generic-password -s "${SERVICE}" -a "${ACCOUNT}" -w`,
    { encoding: 'utf8' }
  ).trim();
}

function deriveKey() {
  const password = getKeychainPassword();
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function encryptForTrae(plaintext) {
  const key = deriveKey();
  const iv = Buffer.alloc(16, 0x20);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from(V10_PREFIX), encrypted]).toString('base64');
}

function decryptForTrae(encoded) {
  if (!encoded) throw new Error('空数据');
  if (encoded.trim().startsWith('{')) return encoded;

  const buf = Buffer.from(encoded, 'base64');
  const prefix = buf.slice(0, 3).toString();

  if (prefix !== V10_PREFIX) {
    throw new Error(`不支持的加密格式: ${buf.slice(0, 6).toString('hex')}`);
  }

  const key = deriveKey();
  const iv = Buffer.alloc(16, 0x20);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]).toString('utf8');
}

function isEncryptedValue(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.trim().startsWith('{')) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.slice(0, 3).toString() === V10_PREFIX;
  } catch {
    return false;
  }
}

module.exports = { encryptForTrae, decryptForTrae, isEncryptedValue };

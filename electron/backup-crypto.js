const crypto = require('crypto');
const { BACKUP_FORMAT } = require('./app-brand');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;
const SCRYPT_N = 16384;

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N });
}

function encryptPayload(plaintext, password) {
  if (!password) throw new Error('请设置导出密码');
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: true,
    format: BACKUP_FORMAT,
    version: 2,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function decryptPayload(wrapped, password) {
  if (!password) throw new Error('请输入导入密码');
  if (!wrapped?.encrypted || !wrapped.data) throw new Error('不是加密备份文件');

  const salt = Buffer.from(wrapped.salt, 'base64');
  const iv = Buffer.from(wrapped.iv, 'base64');
  const tag = Buffer.from(wrapped.tag, 'base64');
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(wrapped.data, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

function isEncryptedBackup(raw) {
  return raw && raw.encrypted === true && !!raw.data;
}

module.exports = { encryptPayload, decryptPayload, isEncryptedBackup };

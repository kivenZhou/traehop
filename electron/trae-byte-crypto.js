// Trae byteCrypto (from Trae IDE main process) — tc\x05\x10 header + AES-CBC
const hx = 16;
const AES128 = 16;
const HASH_LEN = 64;
const KEY_LEN = 32;
const SALT_LEN = 64;
const HEADER_LEN = 6;
const mx = 116; // t
const gx = 99; // c
const vx = 5;
const wx = 16;
const bx = 0;
const yx = 0;

const AES = 1;
const AES_PRIVATE = 2;

const eX = new Uint8Array([
  191, 192, 216, 250, 122, 246, 220, 97, 31, 254, 98, 27, 8, 72, 71, 176, 135, 99, 96, 18, 127, 101,
  203, 104, 211, 102, 191, 125, 37, 72, 150, 156, 51, 229, 121, 35, 17, 153, 141, 177, 110, 131, 150,
  128, 172, 255, 254, 6, 18, 140, 55, 62, 236, 249, 135, 64, 135, 12, 117, 4, 89, 149, 168, 209,
]);
const tX = new Uint8Array([
  246, 204, 26, 232, 232, 70, 129, 109, 223, 146, 169, 242, 23, 241, 105, 145, 50, 196, 165, 42, 254,
  120, 3, 54, 244, 207, 209, 85, 53, 6, 138, 106, 175, 148, 31, 204, 186, 186, 165, 182, 87, 142, 49,
  10, 39, 110, 26, 154, 86, 56, 173, 125, 18, 64, 198, 225, 99, 99, 83, 82, 191, 134, 76, 170,
]);
const iX = Uint8Array.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155, 47,
  255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11,
  66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
]);
const rX = Uint8Array.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74,
  13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131,
  83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
]);

async function sha512(data) {
  const hash = await crypto.subtle.digest('SHA-512', data);
  return new Uint8Array(hash);
}

function deriveSalt(version) {
  const out = new Uint8Array(SALT_LEN);
  if (version === AES_PRIVATE) {
    for (let i = 0; i < SALT_LEN; i++) out[i] = eX[i] ^ tX[i];
  } else {
    for (let i = 0; i < SALT_LEN; i++) out[i] = iX[i] ^ rX[i];
  }
  return out;
}

async function deriveAesKeyIv(rawKey, keySize, ivSize, version = AES) {
  const total = HASH_LEN + SALT_LEN;
  const buf = new Uint8Array(total);
  const hash1 = await sha512(rawKey);
  const salt = deriveSalt(version);
  buf.set(hash1, 0);
  buf.set(salt, HASH_LEN);
  const hash2 = await sha512(buf);
  buf.set(hash2, 0);
  return {
    aesKey: buf.slice(0, keySize),
    iv: buf.slice(keySize, keySize + ivSize),
  };
}

async function aesCbcDecrypt(key, iv, data) {
  if (data.length % hx !== 0) return new Uint8Array(0);
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
    return new Uint8Array(plain);
  } catch {
    return new Uint8Array(0);
  }
}

async function aesCbcEncrypt(key, iv, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
  return new Uint8Array(cipher);
}

function detectVersion(header) {
  if (header[0] === mx && header[1] === gx && header[2] === vx && header[3] === wx && header[4] === bx && header[5] === yx) {
    return AES;
  }
  return 8; // UNKNOWN
}

function extractKey(buf) {
  const version = detectVersion(buf);
  if (version !== AES) return { version, key: new Uint8Array(0) };
  return { version, key: buf.slice(HEADER_LEN, HEADER_LEN + KEY_LEN) };
}

async function decryptBytes(buf) {
  const { version, key } = extractKey(buf);
  if (key.length !== KEY_LEN) throw new Error('invalid key');
  const { aesKey, iv } = await deriveAesKeyIv(key, AES128, hx, version);
  const plain = await aesCbcDecrypt(aesKey, iv, buf.slice(KEY_LEN + HEADER_LEN));
  if (!plain.length) throw new Error('decrypt failed');
  const hash = await sha512(plain.slice(HASH_LEN));
  for (let i = 0; i < HASH_LEN; i++) {
    if (hash[i] !== plain[i]) throw new Error('hash mismatch');
  }
  return plain.slice(HASH_LEN);
}

function makeHeader(randomKey) {
  const header = new Uint8Array(randomKey.length + HEADER_LEN);
  header[0] = mx;
  header[1] = gx;
  header[2] = vx;
  header[3] = wx;
  header[4] = bx;
  header[5] = yx;
  header.set(randomKey, HEADER_LEN);
  return header;
}

async function encryptBytes(plainBytes) {
  const randomKey = crypto.getRandomValues(new Uint8Array(KEY_LEN));
  const { aesKey, iv } = await deriveAesKeyIv(randomKey, AES128, hx, AES);
  const payload = new Uint8Array(HASH_LEN + plainBytes.length);
  const hash = await sha512(plainBytes);
  payload.set(hash, 0);
  payload.set(plainBytes, HASH_LEN);
  const header = makeHeader(randomKey);
  const cipher = await aesCbcEncrypt(aesKey, iv, payload);
  if (!cipher.length) throw new Error('encrypt failed');
  const out = new Uint8Array(header.length + cipher.length);
  out.set(header, 0);
  out.set(cipher, header.length);
  return out;
}

async function encryptString(text) {
  const bytes = new TextEncoder().encode(text);
  const encrypted = await encryptBytes(bytes);
  return Buffer.from(encrypted).toString('base64');
}

async function decryptString(encoded) {
  const binary = Buffer.from(encoded, 'base64');
  const bytes = await decryptBytes(new Uint8Array(binary));
  return new TextDecoder().decode(bytes);
}

module.exports = { encryptString, decryptString };

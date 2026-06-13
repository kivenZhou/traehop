const path = require('path');
const zh = require('../src/locales/zh.json');
const en = require('../src/locales/en.json');

const messages = { zh, en };
let locale = 'zh';

function get(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

function t(key, params) {
  const str = get(messages[locale], key) ?? get(messages.en, key) ?? key;
  return interpolate(str, params);
}

function setLocale(next) {
  if (next === 'zh' || next === 'en') locale = next;
}

function detectLocale() {
  try {
    const lang = (process.env.LANG || process.env.LC_ALL || '').toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
  } catch { /* */ }
  return 'en';
}

module.exports = { t, setLocale, detectLocale, getLocale: () => locale };

const { isTraeRunning } = require('./trae-switcher');
const { isTokenExpired, isAccountTokenExpired } = require('./trae-api');
const accountStore = require('./account-store');

async function checkBeforeSwitch(id) {
  let account = accountStore.getAccount(id);
  const warnings = [];
  const blockers = [];

  if (account.token && isTokenExpired(account.token) && account.cookies) {
    try {
      await accountStore.ensureValidToken(id);
      account = accountStore.getAccount(id);
      warnings.push('Token 已自动刷新');
    } catch (err) {
      blockers.push(`Token 刷新失败：${err.message}`);
    }
  }

  if (!account.token) {
    blockers.push('账号没有有效的 Token');
  } else if (isAccountTokenExpired(account)) {
    blockers.push(account.cookies ? 'Token 已过期，Cookie 刷新失败，请续登' : 'Token 已过期，请先续登');
  } else if (accountStore.isTokenExpiringSoon(account)) {
    if (account.cookies) {
      try {
        await accountStore.refreshAccountToken(id);
        account = accountStore.getAccount(id);
        warnings.push('Token 已提前刷新');
      } catch {
        warnings.push('Token 即将过期，自动刷新失败');
      }
    } else {
      warnings.push('Token 即将过期，建议续登');
    }
  }

  if (isTraeRunning()) {
    warnings.push('Trae IDE 正在运行，切换时会自动关闭');
  }

  if (!account.machineId) {
    warnings.push('未绑定设备标识，切换时将使用当前或新生成的标识');
  }

  return {
    canSwitch: blockers.length === 0,
    warnings,
    blockers,
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      machineId: account.machineId,
    },
  };
}

module.exports = { checkBeforeSwitch };

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
const { getPlatformConfig, getScanPaths } = require('./platform-config');

const execAsync = promisify(exec);
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function runCmd(cmd) {
  return execAsync(cmd, { shell: true });
}

async function runCmdBatch(commands, log, cancelled) {
  for (const cmd of commands) {
    if (cancelled()) return;
    try {
      await runCmd(cmd);
      log(`  执行: ${cmd}`);
    } catch (err) {
      log(`  警告: ${err.message}`);
    }
  }
}

function getDirSize(dirPath) {
  try {
    let total = 0;
    const walk = (p) => {
      const stat = fs.statSync(p);
      if (stat.isFile()) {
        total += stat.size;
        return;
      }
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(p)) {
          walk(path.join(p, entry));
        }
      }
    };
    walk(dirPath);
    return total;
  } catch {
    return 0;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function removePath(targetPath, log) {
  if (!fs.existsSync(targetPath)) {
    log(`  跳过（不存在）: ${targetPath}`);
    return 0;
  }
  const size = getDirSize(targetPath);
  try {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    log(`  已删除: ${targetPath} (${formatSize(size)})`);
    return size;
  } catch (err) {
    log(`  删除失败: ${targetPath} - ${err.message}`);
    return 0;
  }
}

async function killProcessesMac(log, cancelled) {
  const names = ['trae-server', 'ai-agent', 'Trae Helper'];
  for (const name of names) {
    if (cancelled()) return;
    try {
      await runCmd(`pkill -f '${name}' || true`);
      log(`  已尝试结束: ${name}`);
    } catch {
      log(`  进程未运行: ${name}`);
    }
  }
  try {
    await runCmd(`pkill -f 'Trae' || true`);
    log('  已尝试结束: Trae');
  } catch {
    /* ignore */
  }
}

async function killProcessesWin(log, cancelled) {
  const images = ['Trae.exe', 'trae-server.exe', 'Trae Helper.exe', 'Trae Helper (GPU).exe'];
  for (const img of images) {
    if (cancelled()) return;
    try {
      await runCmd(`taskkill /F /IM "${img}" 2>nul`);
      log(`  已尝试结束: ${img}`);
    } catch {
      log(`  进程未运行: ${img}`);
    }
  }
}

async function resetPreferencesMac(log, cancelled) {
  log('重置偏好设置...');
  await runCmdBatch(
    [
      'defaults delete com.trae.app 2>/dev/null || true',
      'defaults delete com.trae.app.helper 2>/dev/null || true',
      'killall cfprefsd 2>/dev/null || true',
    ],
    log,
    cancelled
  );
}

async function resetPreferencesWin(log, cancelled) {
  log('重置偏好设置...');
  const keys = ['HKCU\\Software\\com.trae.app', 'HKCU\\Software\\com.trae.app.helper'];
  for (const key of keys) {
    if (cancelled()) return;
    try {
      await runCmd(`reg delete "${key}" /f 2>nul`);
      log(`  已删除注册表: ${key}`);
    } catch {
      log(`  注册表项不存在: ${key}`);
    }
  }
}

async function resetMachineIdMac(log, machineIdPath, cancelled, removePathFn) {
  log('重置设备标识 (machineId)...');
  if (fs.existsSync(machineIdPath)) {
    await removePathFn(machineIdPath);
  }
  const newUuid = randomUUID();
  const newMacId = randomUUID();
  await runCmdBatch(
    [
      `defaults write com.trae.app machineId -string '${newUuid}'`,
      `defaults write com.trae.app macMachineId -string '${newMacId}'`,
      `defaults write com.trae.app telemetry.machineId -string '${newUuid}'`,
      `defaults write com.trae.app telemetry.enableTelemetry -bool false`,
      `defaults write com.trae.app telemetry.enableCrashReporter -bool false`,
    ],
    log,
    cancelled
  );
  log(`  新 machineId: ${newUuid}`);
}

async function resetMachineIdWin(log, machineIdPath, cancelled, removePathFn) {
  log('重置设备标识 (machineId)...');
  if (fs.existsSync(machineIdPath)) {
    await removePathFn(machineIdPath);
  }
  const newUuid = randomUUID();
  const newMacId = randomUUID();
  const regKey = 'HKCU\\Software\\com.trae.app';
  await runCmdBatch(
    [
      `reg add "${regKey}" /v machineId /t REG_SZ /d "${newUuid}" /f`,
      `reg add "${regKey}" /v macMachineId /t REG_SZ /d "${newMacId}" /f`,
      `reg add "${regKey}" /v telemetry.machineId /t REG_SZ /d "${newUuid}" /f`,
      `reg add "${regKey}" /v telemetry.enableTelemetry /t REG_DWORD /d 0 /f`,
      `reg add "${regKey}" /v telemetry.enableCrashReporter /t REG_DWORD /d 0 /f`,
    ],
    log,
    cancelled
  );
  log(`  新 machineId: ${newUuid}`);
}

async function cleanCredentialsMac(log, cancelled) {
  log('清理 Keychain 中的 Trae 条目...');
  await runCmdBatch(
    [
      "security delete-generic-password -s 'trae' 2>/dev/null || true",
      "security delete-generic-password -s 'com.trae.app' 2>/dev/null || true",
    ],
    log,
    cancelled
  );
}

async function cleanCredentialsWin(log, cancelled) {
  log('清理 Windows 凭据管理器中的 Trae 条目...');
  const script = `
    $targets = @('trae', 'com.trae.app', 'Trae')
    cmdkey /list 2>$null | ForEach-Object {
      if ($_ -match 'Target:\\s*(.+)') {
        $t = $Matches[1].Trim()
        foreach ($k in $targets) {
          if ($t -match $k) { cmdkey /delete:$t 2>$null }
        }
      }
    }
  `.replace(/\n/g, ' ');
  if (cancelled()) return;
  try {
    await runCmd(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`);
    log('  已尝试清理凭据管理器');
  } catch (err) {
    log(`  凭据清理跳过: ${err.message}`);
  }
}

class TraeCleaner {
  constructor(onLog) {
    this.onLog = onLog;
    this.cancelled = false;
    this.config = getPlatformConfig();
  }

  log(msg) {
    this.onLog(msg);
  }

  cancel() {
    this.cancelled = true;
  }

  ensureSupported() {
    if (!this.config) {
      throw new Error(`当前系统 (${process.platform}) 暂不支持，仅支持 macOS 和 Windows`);
    }
  }

  async killProcesses() {
    this.log('正在结束 Trae 相关进程...');
    if (isMac) {
      await killProcessesMac(this.log.bind(this), () => this.cancelled);
    } else if (isWin) {
      await killProcessesWin(this.log.bind(this), () => this.cancelled);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  async cleanAppData() {
    const { appSupportBase, dataSubdirs, winAppCacheDirs, label } = this.config;
    this.log(`清理用户数据 (${label}: ${appSupportBase}) ...`);
    let freed = 0;
    const subdirs = [...dataSubdirs, ...winAppCacheDirs];
    for (const dir of subdirs) {
      if (this.cancelled) return freed;
      freed += await removePath(path.join(appSupportBase, dir), this.log.bind(this));
    }
    return freed;
  }

  async cleanCaches() {
    this.log('清理缓存目录...');
    let freed = 0;
    for (const t of this.config.cachePaths) {
      if (this.cancelled) return freed;
      freed += await removePath(t, this.log.bind(this));
    }
    return freed;
  }

  async resetPreferences() {
    if (isMac) {
      await resetPreferencesMac(this.log.bind(this), () => this.cancelled);
    } else if (isWin) {
      await resetPreferencesWin(this.log.bind(this), () => this.cancelled);
    }
    for (const p of this.config.preferenceFiles) {
      if (fs.existsSync(p)) {
        await removePath(p, this.log.bind(this));
      }
    }
  }

  async resetMachineId() {
    const removeFn = (p) => removePath(p, this.log.bind(this));
    if (isMac) {
      await resetMachineIdMac(
        this.log.bind(this),
        this.config.machineIdPath,
        () => this.cancelled,
        removeFn
      );
    } else if (isWin) {
      await resetMachineIdWin(
        this.log.bind(this),
        this.config.machineIdPath,
        () => this.cancelled,
        removeFn
      );
    }
  }

  async cleanCredentials() {
    if (isMac) {
      await cleanCredentialsMac(this.log.bind(this), () => this.cancelled);
    } else if (isWin) {
      await cleanCredentialsWin(this.log.bind(this), () => this.cancelled);
    }
  }

  async scan() {
    this.ensureSupported();
    const paths = getScanPaths(this.config);
    let total = 0;
    const items = [];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        const size = getDirSize(p);
        total += size;
        items.push({ path: p, size, formatted: formatSize(size) });
      }
    }
    return {
      total,
      formatted: formatSize(total),
      items,
      platform: this.config.label,
    };
  }

  async run() {
    this.ensureSupported();
    this.cancelled = false;
    let totalFreed = 0;
    const start = Date.now();

    this.log('========== 开始清理 Trae ==========');
    this.log(`系统: ${this.config.label}`);
    this.log(`用户目录: ${os.homedir()}`);

    await this.killProcesses();
    totalFreed += await this.cleanAppData();
    totalFreed += await this.cleanCaches();
    await this.resetPreferences();
    await this.resetMachineId();
    await this.cleanCredentials();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (this.cancelled) {
      this.log('清理已取消');
      return { success: false, freed: totalFreed, formatted: formatSize(totalFreed) };
    }

    this.log('========== 清理完成 ==========');
    this.log(`释放空间约: ${formatSize(totalFreed)}`);
    this.log(`耗时: ${elapsed}s`);
    return { success: true, freed: totalFreed, formatted: formatSize(totalFreed), elapsed };
  }
}

module.exports = { TraeCleaner, formatSize };

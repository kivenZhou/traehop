const { Tray, Menu, nativeImage, app } = require('electron');
const { APP_NAME, getIconPath } = require('./app-brand');

let tray = null;

function buildTrayIcon() {
  const iconPath = getIconPath();
  if (require('fs').existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 18, height: 18 });
    }
  }

  const size = 18;
  const canvas = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="4" fill="#6366F1"/>
      <rect x="4" y="5" width="8" height="8" rx="2" fill="#fff" opacity="0.85"/>
      <rect x="6" y="7" width="8" height="8" rx="2" fill="#fff"/>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`
  );
}

function setupTray({ getAccounts, onSwitch, onShowWindow }) {
  if (tray) return tray;

  tray = new Tray(buildTrayIcon());
  tray.setToolTip(APP_NAME);

  const rebuild = async () => {
    let accounts = [];
    try {
      accounts = await getAccounts();
    } catch {
      accounts = [];
    }

    const switchItems = accounts.slice(0, 12).map((a) => ({
      label: `${a.isCurrent ? '● ' : ''}${a.email || a.name || a.id.slice(0, 8)}`,
      enabled: !a.isCurrent && (!a.tokenExpired || a.hasCookies),
      click: () => onSwitch(a.id),
    }));

    const menu = Menu.buildFromTemplate([
      { label: `打开 ${APP_NAME}`, click: onShowWindow },
      { type: 'separator' },
      ...(switchItems.length
        ? [{ label: '手动切换', enabled: false }, ...switchItems, { type: 'separator' }]
        : [{ label: '暂无账号', enabled: false }, { type: 'separator' }]),
      { label: '退出', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };

  tray.on('click', onShowWindow);
  rebuild();

  return { tray, rebuild };
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { setupTray, destroyTray };

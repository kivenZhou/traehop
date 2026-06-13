const http = require('http');
const path = require('path');
const { BrowserWindow } = require('electron');
const { APP_NAME } = require('./app-brand');

// Ephemeral partition (no persist: prefix) — fresh cookies each login, like incognito.
function createLoginPartition() {
  return `trae-login-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let activeLogin = null;

function closeBrowserLogin() {
  if (activeLogin && !activeLogin.isDestroyed()) {
    activeLogin.close();
  }
}

async function collectSessionCookies(loginWindow) {
  if (!loginWindow || loginWindow.isDestroyed()) return '';
  const cookies = await loginWindow.webContents.session.cookies.get({});
  return cookies
    .filter((c) => c.domain && (c.domain.includes('trae.ai') || c.domain.includes('trae.')))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function startBrowserLogin({ parentWindow, onSuccess, onFailed, onCancelled }) {
  if (activeLogin) {
    activeLogin.focus();
    return;
  }

  let loginWindow = null;
  let server = null;
  let finished = false;

  const cleanup = () => {
    activeLogin = null;
    if (server) {
      server.close();
      server = null;
    }
  };

  server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });

      try {
        const data = JSON.parse(body || '{}');
        const token = data.token;
        if (!token || token.length < 50) {
          res.end(JSON.stringify({ status: 'waiting' }));
          return;
        }

        if (finished) {
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }
        finished = true;

        res.end(JSON.stringify({ status: 'ok' }));

        let cookies = data.cookies || '';
        const expiredAt = data.expiredAt || '';
        if (loginWindow && !loginWindow.isDestroyed()) {
          const sessionCookies = await collectSessionCookies(loginWindow);
          if (sessionCookies) cookies = sessionCookies;
          loginWindow.close();
        }
        cleanup();

        try {
          const account = await onSuccess(token, cookies, expiredAt);
          onFailed = null;
          onCancelled = null;
          if (parentWindow && !parentWindow.isDestroyed()) {
            parentWindow.webContents.send('login:success', {
              email: account.email || account.name,
            });
          }
        } catch (err) {
          if (parentWindow && !parentWindow.isDestroyed()) {
            parentWindow.webContents.send('login:failed', err.message || String(err));
          }
        }
      } catch (err) {
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
  });

  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;

    loginWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: false,
      closable: true,
      minimizable: true,
      maximizable: false,
      title: `${APP_NAME} — 登录账号`,
      autoHideMenuBar: true,
      webPreferences: {
        // Isolated in-memory session so each add/re-login starts logged out.
        partition: createLoginPartition(),
        // Preload injects fetch hook before page CSP/scripts run.
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, 'login-preload.js'),
        additionalArguments: [`--login-port=${port}`],
      },
    });

    activeLogin = loginWindow;
    loginWindow.center();

    loginWindow.on('closed', () => {
      loginWindow = null;
      if (!finished) {
        finished = true;
        cleanup();
        if (onCancelled && parentWindow && !parentWindow.isDestroyed()) {
          parentWindow.webContents.send('login:cancelled');
        }
      }
    });

    loginWindow.loadURL('https://www.trae.ai');
  });
}

module.exports = { startBrowserLogin, closeBrowserLogin };

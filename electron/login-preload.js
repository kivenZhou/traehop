// Runs before trae.ai page scripts so GetUserToken can be intercepted (no CSP inline issues).
const portArg = process.argv.find((a) => a.startsWith('--login-port='));
const port = portArg ? portArg.split('=')[1] : '';
if (!port) return;

(function hookGetUserToken() {
  const callbackUrl = `http://127.0.0.1:${port}/callback`;
  let sent = false;

  function tryExtractToken(text) {
    try {
      const data = typeof text === 'string' ? JSON.parse(text) : text;
      if (data?.Result?.Token) {
        return { token: data.Result.Token, expiredAt: data.Result.ExpiredAt || '' };
      }
      if (data?.result?.token) {
        return {
          token: data.result.token,
          expiredAt: data.result.expiredAt || data.result.expired_at || '',
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function sendToken(token, expiredAt) {
    if (sent || !token || token.length < 50) return;
    sent = true;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', callbackUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({
      token,
      expiredAt: expiredAt || '',
      cookies: document.cookie || '',
    }));
  }

  const origFetch = window.fetch;
  window.fetch = function fetchHook(...args) {
    let url = args[0];
    if (typeof url === 'object' && url?.url) url = url.url;
    const p = origFetch.apply(this, args);
    if (typeof url === 'string' && url.includes('GetUserToken')) {
      p.then((resp) => resp.clone().text())
        .then((text) => {
          const extracted = tryExtractToken(text);
          if (extracted) sendToken(extracted.token, extracted.expiredAt);
        })
        .catch(() => {});
    }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function openHook(method, url, ...rest) {
    this.__hookUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function sendHook(...args) {
    if (this.__hookUrl && String(this.__hookUrl).includes('GetUserToken')) {
      this.addEventListener('load', () => {
        const extracted = tryExtractToken(this.responseText);
        if (extracted) sendToken(extracted.token, extracted.expiredAt);
      });
    }
    return origSend.apply(this, args);
  };
})();

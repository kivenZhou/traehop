const api = window.traeAccounts;
const t = (key, params) => window.TraeHopI18n.t(key, params);
const localeTag = () => (window.TraeHopI18n.getLocale() === 'zh' ? 'zh-CN' : 'en-US');
const listSep = () => (window.TraeHopI18n.getLocale() === 'zh' ? '，' : ', ');

function formatFilterCount(filtered, total, selCount) {
  if (initialLoading || accountsSyncing) {
    return accountsSyncing ? t('common.syncing') : t('common.loading');
  }
  let text = filtered === total
    ? t('accounts.countTotal', { n: total })
    : t('accounts.countShowing', { shown: filtered, total });
  if (selCount) text += t('accounts.countSelected', { n: selCount });
  return text;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const accountList = $('#account-list');
const toast = $('#toast');
const addDialog = $('#add-dialog');
const exportDialog = $('#export-dialog');
const importDialog = $('#import-dialog');
const detailDialog = $('#account-detail-dialog');
const traePathEl = $('#trae-path');

let toastTimer = null;
let usageMap = {};
let allAccounts = [];
let addMode = 'browser';
let browserLoginActive = false;
let reloginAccountId = null;
let currentPage = 'overview';
let quotaFilter = 'all';
let accountSearch = '';
let accountSort = 'default';
let selectedIds = new Set();
let appSettings = {};
let autoRefreshTimer = null;
let lastRefreshTime = null;
let refreshDebounce = null;
let cleanCleaning = false;
let cleanScanned = false;
let lastBackupTs = null;
let cachedTraePath = null;
let initialLoading = true;
let accountsSyncing = false;
let accountsSyncMessage = '';
let importPending = null;

const RING_CIRCUMFERENCE = 327;

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function unwrap(promise) {
  const res = await promise;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortenPath(p) {
  const s = String(p);
  if (s.length <= 52) return s;
  const parts = s.split(/[/\\]/);
  if (parts.length > 3) return `${parts[0]}/…/${parts.slice(-2).join('/')}`;
  return `…${s.slice(-48)}`;
}

function formatResetCountdown(resetTimeSec) {
  if (!resetTimeSec) return '—';
  const diff = resetTimeSec * 1000 - Date.now();
  if (diff <= 0) return t('time.resetSoon');
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return t('time.daysHours', { days, hours });
  const mins = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? t('time.hoursMins', { hours, mins }) : t('time.minsOnly', { mins });
}

function formatDateTime(resetTimeSec) {
  if (!resetTimeSec) return '—';
  return new Date(resetTimeSec * 1000).toLocaleString(localeTag(), {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatRefreshTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getUsageMetrics(usage) {
  const isDollar = !!usage?.isDollarBilling;
  const used = usage?.displayUsed ?? 0;
  const limit = usage?.displayLimit ?? 0;
  const left = usage?.displayLeft ?? Math.max(0, limit - used);
  const exhausted = !!usage?.exhausted;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return {
    isDollar, used, limit, left, exhausted, pct,
    usedText: isDollar ? `$${Number(used).toFixed(2)}` : String(Math.round(used)),
    limitText: isDollar ? `$${Number(limit).toFixed(2)}` : String(Math.round(limit)),
    leftText: exhausted ? t('overview.exhausted') : isDollar ? `$${left.toFixed(2)}` : String(Math.round(left)),
    leftNum: left,
  };
}

function getAccountQuotaStatus(account) {
  if (account.tokenExpired) return 'no-quota';
  const u = usageMap[account.id];
  if (u?.loading) return 'unknown';
  if (u?.error) return 'no-quota';
  if (!u?.data) return 'unknown';
  const m = getUsageMetrics(u.data);
  if (m.exhausted || m.left <= 0) return 'no-quota';
  return 'has-quota';
}

function getQuotaLeftNum(account) {
  const u = usageMap[account.id]?.data;
  if (!u) return -1;
  return getUsageMetrics(u).leftNum;
}

function filterAccounts(accounts) {
  let list = accounts;
  if (quotaFilter !== 'all') {
    list = list.filter((a) => {
      if (quotaFilter === 'expiring-soon') return a.tokenExpiringSoon && !a.tokenExpired;
      if (quotaFilter === 'expired') return a.tokenExpired;
      const status = getAccountQuotaStatus(a);
      if (quotaFilter === 'has-quota') return status === 'has-quota';
      if (quotaFilter === 'no-quota') return status === 'no-quota';
      return true;
    });
  }
  const q = accountSearch.trim().toLowerCase();
  if (q) {
    list = list.filter((a) =>
      [a.email, a.name, a.note, a.group].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }
  return sortAccounts(list);
}

function sortAccounts(list) {
  const copy = [...list];
  switch (accountSort) {
    case 'quota-desc':
      return copy.sort((a, b) => getQuotaLeftNum(b) - getQuotaLeftNum(a));
    case 'quota-asc':
      return copy.sort((a, b) => getQuotaLeftNum(a) - getQuotaLeftNum(b));
    case 'name':
      return copy.sort((a, b) => (a.email || a.name || '').localeCompare(b.email || b.name || ''));
    case 'expiry':
      return copy.sort((a, b) => getAccountExpirySortKey(a) - getAccountExpirySortKey(b));
    default:
      return copy;
  }
}

function getAccountExpirySortKey(account) {
  if (account.tokenExpiredAt) {
    const ts = Date.parse(account.tokenExpiredAt);
    if (!Number.isNaN(ts)) return ts;
  }
  return (account.tokenExp || 9999999999) * 1000;
}

function computeStats(accounts) {
  let hasQuota = 0, noQuota = 0, expired = 0, expiring = 0;
  let totalUsed = 0, totalLimit = 0, totalLeft = 0, nearestReset = 0, anyDollar = false;

  for (const a of accounts) {
    if (a.tokenExpired) { expired += 1; noQuota += 1; continue; }
    if (a.tokenExpiringSoon) expiring += 1;
    const status = getAccountQuotaStatus(a);
    if (status === 'has-quota') hasQuota += 1;
    else if (status === 'no-quota') noQuota += 1;
    const u = usageMap[a.id]?.data;
    if (u) {
      if (u.isDollarBilling) anyDollar = true;
      const m = getUsageMetrics(u);
      totalUsed += m.used; totalLimit += m.limit; totalLeft += m.left;
      if (u.resetTime && (!nearestReset || u.resetTime < nearestReset)) nearestReset = u.resetTime;
    }
  }

  const usedPct = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
  const fmt = (v) => (anyDollar ? `$${v.toFixed(2)}` : String(Math.round(v)));
  return { total: accounts.length, hasQuota, noQuota, expired, expiring, totalUsed, totalLimit, totalLeft, usedPct, nearestReset, anyDollar, fmt };
}

async function loadUsageHistory() {
  try {
    const history = await unwrap(api.getUsageHistory());
    const el = $('#usage-history');
    const header = document.querySelector('.history-header');
    if (!history.length) {
      el.innerHTML = `<p class="muted">${escapeHtml(t('overview.historyEmpty'))}</p>`;
      header?.classList.add('hidden');
      return;
    }
    header?.classList.remove('hidden');
    el.innerHTML = history.slice(0, 20).map((h) => {
      const left = h.isDollarBilling ? `$${Number(h.left).toFixed(2)}` : Math.round(h.left);
      return `<div class="history-row"><span class="history-email">${escapeHtml(h.email || '—')}</span><span class="history-val">${escapeHtml(t('overview.historyLeftVal', { left }))}</span><span class="history-time">${formatTs(h.timestamp)}</span></div>`;
    }).join('');
  } catch { /* optional */ }
}

function renderExpiryAlerts() {
  const panel = $('#expiry-alerts');
  const list = $('#expiry-alert-list');
  if (appSettings.notifyTokenExpiry === false) {
    panel.classList.add('hidden');
    return;
  }

  const alerts = allAccounts
    .filter((a) => a.tokenExpired || (a.tokenExpiringSoon && !a.tokenExpired))
    .map((a) => {
      if (a.tokenExpired) {
        return {
          accountId: a.id,
          email: a.email || a.name,
          message: t('accounts.alertExpired'),
          action: t('accounts.relogin'),
          actionClass: 'btn-relogin-alert',
        };
      }
      if (a.hasCookies) {
        return {
          accountId: a.id,
          email: a.email || a.name,
          message: t('accounts.alertExpiringRefresh'),
          action: t('accounts.refreshToken'),
          actionClass: 'btn-refresh-token-alert',
        };
      }
      return {
        accountId: a.id,
        email: a.email || a.name,
        message: t('accounts.alertExpiringPrelogin'),
        action: t('accounts.prelogin'),
        actionClass: 'btn-relogin-alert',
      };
    });

  if (!alerts.length) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  list.innerHTML = alerts
    .map(
      (a) =>
        `<li><span>${escapeHtml(a.email || t('common.account'))}</span><span class="alert-msg">${escapeHtml(a.message)}</span><button class="btn-text ${a.actionClass}" data-id="${a.accountId}">${escapeHtml(a.action)}</button></li>`
    )
    .join('');
}

function accountsLoadingHtml(message) {
  return `<div class="page-loading page-loading-inline"><div class="loading-spinner" aria-hidden="true"></div><p class="loading-text">${escapeHtml(message)}</p></div>`;
}

function beginAccountsSync(message) {
  accountsSyncing = true;
  accountsSyncMessage = message;
  renderUI();
}

function endAccountsSync() {
  accountsSyncing = false;
  accountsSyncMessage = '';
}

function setAccountsToolbarBusy(busy) {
  ['#btn-export-accounts', '#btn-import-file', '#btn-import-trae', '#btn-refresh-usage', '#btn-add'].forEach((sel) => {
    const el = $(sel);
    if (el) el.disabled = busy;
  });
}

function updateOverview(accounts) {
  const loading = $('#overview-loading');
  const empty = $('#overview-empty');
  const content = $('#overview-content');
  const loadingText = loading?.querySelector('.loading-text');
  $('#nav-account-count').textContent = (initialLoading || accountsSyncing) ? '…' : accounts.length;

  if (initialLoading || accountsSyncing) {
    if (loadingText) {
      loadingText.textContent = initialLoading ? t('overview.detecting') : accountsSyncMessage;
    }
    loading?.classList.remove('hidden');
    empty.classList.add('hidden');
    content.classList.add('hidden');
    return;
  }

  loading?.classList.add('hidden');

  if (!accounts.length) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');

  const s = computeStats(accounts);
  $('#stat-total').textContent = s.total;
  $('#stat-active').textContent = s.hasQuota;
  $('#stat-no-quota').textContent = s.noQuota;
  $('#stat-expired').textContent = s.expired;
  $('#stat-expiring').textContent = s.expiring;
  $('#stat-left').textContent = s.fmt(s.totalLeft);
  $('#stat-used').textContent = s.fmt(s.totalUsed);
  $('#stat-limit').textContent = s.fmt(s.totalLimit);
  $('#stat-used-pct').textContent = `${s.usedPct}%`;
  $('#stat-used-pct-inline').textContent = `${s.usedPct}%`;
  $('#stat-used-inline').textContent = s.fmt(s.totalUsed);
  $('#stat-limit-inline').textContent = s.fmt(s.totalLimit);
  $('#stat-active-ratio').textContent = s.total ? `${Math.round((s.hasQuota / s.total) * 100)}%` : '—';
  $('#stat-no-quota-ratio').textContent = s.total ? `${Math.round((s.noQuota / s.total) * 100)}%` : '—';
  $('#stat-limit-unit').textContent = s.anyDollar ? t('overview.dollarUsage') : t('overview.fastRequests');
  $('#stat-reset').textContent = s.nearestReset ? `${formatResetCountdown(s.nearestReset)} · ${formatDateTime(s.nearestReset)}` : '—';
  $('#last-refresh-time').textContent = formatRefreshTime(lastRefreshTime);
  renderExpiryAlerts();

  const ring = $('#ring-progress');
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE - (s.usedPct / 100) * RING_CIRCUMFERENCE;
  ring.style.stroke = s.usedPct >= 90 ? 'var(--red)' : s.usedPct >= 60 ? 'var(--amber)' : 'var(--primary)';

  const stripFill = $('#strip-progress-fill');
  if (stripFill) {
    stripFill.style.width = `${s.usedPct}%`;
    stripFill.style.background = s.usedPct >= 90 ? 'var(--red)' : s.usedPct >= 60 ? 'var(--amber)' : 'var(--primary)';
  }
}

function renderQuotaHtml(u) {
  if (u?.loading) return `<div class="quota-loading">${escapeHtml(t('common.loading'))}</div>`;
  if (u?.error) {
    return `<div class="quota-loading" style="color:var(--red)">${escapeHtml(u.error)}</div>`;
  }
  if (u?.data) {
    const m = getUsageMetrics(u.data);
    const color = m.exhausted || m.pct >= 80 ? 'var(--red)' : m.pct >= 50 ? 'var(--amber)' : 'var(--green)';
    return `<div class="quota-text"><span><strong>${m.usedText}</strong> / ${m.limitText}</span><span class="quota-left ${m.exhausted ? 'exhausted' : ''}">${m.leftText}</span></div><div class="quota-bar"><div class="quota-bar-fill" style="width:${m.pct}%;background:${color}"></div></div>`;
  }
  return '<div class="quota-loading">—</div>';
}

function renderAccountTags(a) {
  const u = usageMap[a.id];
  const status = getAccountQuotaStatus(a);
  return [
    a.group ? `<span class="tag tag-group">${escapeHtml(a.group)}</span>` : '',
    u?.data ? `<span class="tag tag-plan">${escapeHtml(u.data.planType || 'Free')}</span>` : '',
    a.isCurrent ? `<span class="tag tag-current">${escapeHtml(t('accounts.tagCurrent'))}</span>` : '',
    a.tokenExpired ? `<span class="tag tag-expired">${escapeHtml(t('accounts.tagExpired'))}</span>` : '',
    a.tokenExpiringSoon && !a.tokenExpired ? `<span class="tag tag-warn">${escapeHtml(t('accounts.tagExpiring'))}</span>` : '',
    status === 'has-quota' ? `<span class="tag tag-ok">${escapeHtml(t('accounts.tagOk'))}</span>` : '',
    status === 'no-quota' && !a.tokenExpired ? `<span class="tag tag-exhausted">${escapeHtml(t('accounts.tagExhausted'))}</span>` : '',
  ].filter(Boolean).join('');
}

function patchAccountCardUsage(id) {
  const account = allAccounts.find((a) => a.id === id);
  if (!account) return;
  const card = document.querySelector(`.account-card[data-id="${id}"]`);
  if (!card) return;
  const u = usageMap[id];
  const quotaEl = card.querySelector('.account-quota');
  const tagsEl = card.querySelector('.account-tags');
  if (quotaEl) quotaEl.innerHTML = renderQuotaHtml(u);
  if (tagsEl) tagsEl.innerHTML = renderAccountTags(account);
  const refreshBtn = card.querySelector('.btn-refresh-one');
  if (refreshBtn) {
    refreshBtn.disabled = !!u?.loading;
    refreshBtn.classList.toggle('is-loading', !!u?.loading);
  }
}

function renderAccountCard(a) {
  const u = usageMap[a.id];
  const hasEmail = !!(a.email && a.email.includes('@'));
  const title = hasEmail ? a.email : (a.name || `User ${a.id.slice(0, 8)}`);
  const sub = [a.group, hasEmail && a.name && a.name !== a.email ? a.name : '', a.note].filter(Boolean).join(' · ');

  const quotaHtml = renderQuotaHtml(u);
  const tags = renderAccountTags(a);

  const checked = selectedIds.has(a.id) ? 'checked' : '';

  return `
    <div class="account-card ${a.isCurrent ? 'current' : ''} ${a.tokenExpired ? 'token-expired' : ''}" data-id="${a.id}">
      <label class="account-check"><input type="checkbox" class="account-select" data-id="${a.id}" ${checked} /></label>
      <div class="avatar">${a.avatarUrl ? `<img src="${escapeHtml(a.avatarUrl)}" alt="" />` : escapeHtml((title || '?').charAt(0).toUpperCase())}</div>
      <div class="account-main">
        <div class="account-head">
          <div class="account-head-text">
            <div class="account-title">${escapeHtml(title)}</div>
            ${sub ? `<div class="account-sub">${escapeHtml(sub)}</div>` : ''}
          </div>
          ${tags ? `<div class="account-tags">${tags}</div>` : ''}
        </div>
        <div class="account-quota">${quotaHtml}</div>
      </div>
      <div class="account-actions">
        <button class="btn-icon btn-detail" data-id="${a.id}" title="${escapeHtml(t('common.details'))}">⋯</button>
        <button class="btn-icon btn-refresh-one" data-id="${a.id}" title="${escapeHtml(t('common.refreshUsage'))}">↻</button>
        ${a.tokenExpired && a.hasCookies ? `<button class="btn btn-ghost btn-action btn-refresh-token" data-id="${a.id}">${escapeHtml(t('common.refresh'))}</button>` : ''}
        ${a.tokenExpired ? `<button class="btn btn-ghost btn-action btn-relogin" data-id="${a.id}">${escapeHtml(t('accounts.relogin'))}</button>` : ''}
        <div class="account-switch-btns">
          <button class="btn btn-primary btn-action btn-switch-account" data-id="${a.id}" ${a.isCurrent || (a.tokenExpired && !a.hasCookies) ? 'disabled' : ''} title="${escapeHtml(a.isCurrent ? t('accounts.switchTitleCurrent') : t('accounts.switchTitle'))}">${a.isCurrent ? escapeHtml(t('common.current')) : escapeHtml(t('common.switch'))}</button>
          <button class="btn btn-ghost btn-action btn-clean-switch" data-id="${a.id}" ${a.isCurrent || (a.tokenExpired && !a.hasCookies) ? 'disabled' : ''} title="${escapeHtml(a.isCurrent ? t('accounts.cleanSwitchTitleCurrent') : t('accounts.cleanSwitchTitle'))}">${escapeHtml(t('accounts.cleanSwitch'))}</button>
        </div>
        <button class="btn-icon btn-danger btn-remove" data-id="${a.id}" title="${escapeHtml(t('common.delete'))}">×</button>
      </div>
    </div>`;
}

function renderUI() {
  updateOverview(allAccounts);
  setAccountsToolbarBusy(accountsSyncing);
  const filtered = filterAccounts(allAccounts);
  const selCount = selectedIds.size;
  $('#filter-count').textContent = formatFilterCount(filtered.length, allAccounts.length, selCount);

  if (initialLoading || accountsSyncing) {
    accountList.innerHTML = accountsLoadingHtml(
      initialLoading ? t('overview.detecting') : accountsSyncMessage
    );
    return;
  }

  if (!allAccounts.length) {
    accountList.innerHTML = `<p class="empty">${escapeHtml(t('accounts.empty'))}</p>`;
    return;
  }
  if (!filtered.length) {
    accountList.innerHTML = `<p class="empty">${escapeHtml(t('accounts.emptyFilter'))}</p>`;
    return;
  }
  accountList.innerHTML = filtered.map(renderAccountCard).join('');
  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  const visible = filterAccounts(allAccounts).map((a) => a.id);
  const allSelected = visible.length > 0 && visible.every((id) => selectedIds.has(id));
  $('#select-all-accounts').checked = allSelected;
}

async function loadUsageForAccount(id) {
  try {
    const data = await unwrap(api.getAccountUsage(id));
    usageMap[id] = { data };
  } catch (err) {
    usageMap[id] = { error: err.message };
  }
}

async function refreshOneAccountUsage(id) {
  if (usageMap[id]?.loading) return;
  usageMap[id] = { loading: true };
  patchAccountCardUsage(id);
  await loadUsageForAccount(id);
  patchAccountCardUsage(id);
  lastRefreshTime = new Date();
  if (currentPage === 'overview') updateOverview(allAccounts);
}

async function loadAllUsage(silent = false) {
  if (!allAccounts.length) return;
  if (!silent) { for (const a of allAccounts) usageMap[a.id] = { loading: true }; renderUI(); }
  await Promise.allSettled(allAccounts.map((a) => loadUsageForAccount(a.id)));
  lastRefreshTime = new Date();
  renderUI();
  updateAutoRefreshStatus();
  await loadUsageHistory();
}

function scheduleRefreshAccounts() {
  clearTimeout(refreshDebounce);
  refreshDebounce = setTimeout(() => refreshAccounts(), 400);
}

async function refreshAccounts({ syncMessage = null } = {}) {
  const showSync = !!syncMessage;
  if (showSync) beginAccountsSync(syncMessage);
  try {
    try {
      const result = await unwrap(api.refreshExpiredTokens());
      if (result.refreshed > 0) showToast(t('toast.autoRefreshTokens', { n: result.refreshed }));
    } catch { /* ignore */ }
    let accounts = await unwrap(api.listAccounts());
    if (accounts.some((a) => !a.email)) {
      try { await unwrap(api.refreshProfiles()); accounts = await unwrap(api.listAccounts()); } catch { /* */ }
    }
    allAccounts = accounts;
    selectedIds = new Set([...selectedIds].filter((id) => accounts.some((a) => a.id === id)));
    initialLoading = false;
    if (showSync) endAccountsSync();
    renderUI();
    if (accounts.length) await loadAllUsage(true);
    renderUI();
  } catch (err) {
    initialLoading = false;
    endAccountsSync();
    renderUI();
    throw err;
  }
}

async function confirmSwitchWarnings(check) {
  if (!check.warnings?.length) return true;
  return confirm(t('confirm.switchWarnings', {
    warnings: check.warnings.map((w) => `• ${w}`).join('\n'),
  }));
}

async function handleSwitch(id, skipCheck = false) {
  if (!skipCheck) {
    const check = await unwrap(api.checkSwitch(id));
    if (!check.canSwitch) throw new Error(check.blockers.join('；'));
    if (!(await confirmSwitchWarnings(check))) return null;
  }
  const result = await unwrap(api.switchAccount(id, skipCheck));
  showToast(t('toast.switched', { email: result.email || t('common.account') }));
  await refreshAccounts();
  return result;
}

async function handleCleanSwitch(id) {
  const check = await unwrap(api.checkSwitch(id));
  if (!check.canSwitch) throw new Error(check.blockers.join('；'));
  const msg = [
    t('common.advanced'),
    '',
    t('clean.cleanSwitchConfirm'),
    t('clean.cleanSwitchWarn'),
    '',
    ...(check.warnings.length ? [...check.warnings.map((w) => `• ${w}`), ''] : []),
    t('common.continue'),
  ].join('\n');
  if (!confirm(msg)) return;

  showToast(t('clean.cleanSwitchProgress'));
  const result = await unwrap(api.cleanAndSwitch(id));
  showToast(t('toast.cleanSwitched', { email: result.email || t('common.account') }));
  await refreshAccounts();
}

function switchPage(page) {
  currentPage = page;
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
  $$('.page').forEach((el) => el.classList.toggle('active', el.id === `page-${page}`));
  if (page === 'clean' && !cleanScanned && !cleanCleaning) scanCleanSize();
  if (page === 'overview') {
    loadUsageHistory();
    renderExpiryAlerts();
  }
}

async function scanCleanSize() {
  const sizeEl = $('#clean-scan-size');
  const itemsEl = $('#clean-scan-items');
  const platformEl = $('#clean-platform');
  sizeEl.textContent = t('common.scanning');
  itemsEl.innerHTML = '';
  platformEl.textContent = '';
  try {
    const data = await unwrap(api.scanClean());
    sizeEl.textContent = data.formatted;
    platformEl.textContent = data.platform || '';
    if (data.items?.length) {
      itemsEl.innerHTML = data.items.slice(0, 5).map((item) =>
        `<li><span class="clean-item-path" title="${escapeHtml(item.path)}">${escapeHtml(shortenPath(item.path))}</span><span class="clean-item-size">${escapeHtml(item.formatted)}</span></li>`
      ).join('');
      if (data.items.length > 5) itemsEl.innerHTML += `<li class="clean-item-more">${escapeHtml(t('clean.moreItems', { n: data.items.length - 5 }))}</li>`;
    }
    cleanScanned = true;
  } catch (err) {
    sizeEl.textContent = t('common.scanFailed');
    showToast(err.message, true);
  }
}

function appendCleanLog(msg) {
  const el = $('#clean-log');
  el.textContent += `${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function setCleanRunning(running) {
  cleanCleaning = running;
  $('#btn-start-clean').disabled = running;
  $('#btn-start-clean').textContent = running ? t('clean.cleaning') : t('clean.start');
  $('#btn-cancel-clean').classList.toggle('hidden', !running);
  $('#btn-rescan-clean').disabled = running;
}

async function handleClean() {
  if (cleanCleaning) return;
  if (!confirm(`${t('common.advanced')}\n\n${t('clean.confirmBody')}\n\n${t('common.continue')}`)) return;
  setCleanRunning(true);
  $('#clean-log').textContent = '';
  const unsub = api.onCleanLog(appendCleanLog);
  const res = await api.startClean();
  unsub();
  setCleanRunning(false);
  cleanScanned = false;
  if (res.ok && res.data?.success) {
    showToast(t('clean.done', { size: res.data.formatted }));
    await scanCleanSize();
    await refreshAccounts();
  } else if (res.ok && res.data && !res.data.success) {
    showToast(t('clean.cancelled'));
    await scanCleanSize();
  } else if (!res.ok) {
    appendCleanLog(t('clean.errorLog', { msg: res.error }));
    showToast(res.error, true);
  }
}

function setupAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  if (appSettings.autoRefreshEnabled && allAccounts.length) {
    autoRefreshTimer = setInterval(() => loadAllUsage(true), appSettings.autoRefreshIntervalMinutes * 60000);
  }
  updateAutoRefreshStatus();
}

function updateAutoRefreshStatus() {
  const el = $('#auto-refresh-status');
  if (!appSettings.autoRefreshEnabled) { el.textContent = t('settings.autoRefreshOff'); return; }
  el.textContent = t('settings.autoRefreshOn', { n: appSettings.autoRefreshIntervalMinutes })
    + (lastRefreshTime ? t('settings.autoRefreshLast', { time: formatRefreshTime(lastRefreshTime) }) : '');
}

function applyTheme(theme) {
  const mode = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem('traehop-theme', mode); } catch { /* */ }
  const label = $('#theme-toggle-label');
  if (label) label.textContent = mode === 'dark' ? t('theme.darkMode') : t('theme.lightMode');
  $$('.theme-segment-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === mode);
  });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSettings({ theme: next });
}

function refreshSettingsLabels() {
  $('#backup-dir').textContent = appSettings.autoBackupDir || t('common.notSet');
  $('#last-backup-time').textContent = lastBackupTs
    ? t('settings.lastBackup', { time: formatTs(lastBackupTs) })
    : t('settings.neverBackedUp');
  traePathEl.textContent = cachedTraePath || t('common.notConfigured');
}

async function loadSettings() {
  appSettings = await unwrap(api.getAppSettings());
  const lang = appSettings.language || window.TraeHopI18n.detectLocale();
  window.TraeHopI18n.initI18n(lang);
  $('#setting-language').value = lang;
  applyTheme(appSettings.theme);
  $('#setting-auto-refresh').checked = appSettings.autoRefreshEnabled;
  $('#setting-interval').value = String(appSettings.autoRefreshIntervalMinutes);
  $('#setting-notify-quota').checked = appSettings.notifyLowQuota;
  $('#setting-notify-expiry').checked = appSettings.notifyTokenExpiry;
  $('#setting-quota-threshold').value = String(appSettings.lowQuotaThreshold);
  $('#setting-auto-backup').checked = appSettings.autoBackupEnabled;
  $('#setting-backup-interval').value = String(appSettings.autoBackupIntervalHours);
  lastBackupTs = await unwrap(api.getLastBackup());
  refreshSettingsLabels();
  setupAutoRefresh();
}

async function saveSettings(partial) {
  appSettings = await unwrap(api.saveAppSettings(partial));
  setupAutoRefresh();
}

async function loadTraePath() {
  cachedTraePath = await unwrap(api.getTraePath());
  traePathEl.textContent = cachedTraePath || t('common.notConfigured');
}

function extractTokenPayload(input) {
  const trimmed = input.trim().replace(/[\r\n\t]/g, '');
  if (trimmed.startsWith('eyJ')) {
    const parts = trimmed.split('.');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
      return { token: trimmed, tokenExpiredAt: null };
    }
  }
  try {
    const json = JSON.parse(trimmed);
    if (json.Result?.Token) {
      return { token: json.Result.Token, tokenExpiredAt: json.Result.ExpiredAt || null };
    }
    if (json.result?.token) {
      return {
        token: json.result.token,
        tokenExpiredAt: json.result.expiredAt || json.result.expired_at || null,
      };
    }
    if (json.token) return { token: json.token, tokenExpiredAt: json.expiredAt || null };
    if (json.Token) return { token: json.Token, tokenExpiredAt: json.ExpiredAt || null };
  } catch { /* */ }
  const m = trimmed.match(/"Token"\s*:\s*"(eyJ[^"]+)"/) || trimmed.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  const token = m ? (m[1] || m[0]) : null;
  if (!token) return null;
  const expiredMatch = trimmed.match(/"ExpiredAt"\s*:\s*"([^"]+)"/);
  return { token, tokenExpiredAt: expiredMatch?.[1] || null };
}

function updateAddDialogFooter() {
  $('#btn-submit-add').classList.toggle('hidden', addMode !== 'token');
  $('#btn-cancel-browser').classList.toggle('hidden', addMode !== 'browser' || !browserLoginActive);
}

function resetBrowserLoginState() {
  browserLoginActive = false;
  reloginAccountId = null;
  $('#btn-browser-login').disabled = false;
  $('#browser-login-status').classList.add('hidden');
  updateAddDialogFooter();
}

async function closeAddDialog() {
  if (browserLoginActive) await api.cancelBrowserLogin().catch(() => {});
  resetBrowserLoginState();
  addDialog.close();
}

function setAddMode(mode) {
  addMode = mode;
  $$('.add-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  $('#panel-browser').classList.toggle('hidden', mode !== 'browser');
  $('#panel-token').classList.toggle('hidden', mode !== 'token');
  $('#panel-trae').classList.toggle('hidden', mode !== 'trae');
  updateAddDialogFooter();
}

function openAddDialog() {
  $('#token-input').value = '';
  resetBrowserLoginState();
  setAddMode('browser');
  addDialog.showModal();
}

async function startRelogin(accountId, { advance = false } = {}) {
  reloginAccountId = accountId;
  const account = allAccounts.find((a) => a.id === accountId);
  const label = account?.email || account?.name || t('toast.targetAccount');
  try {
    await unwrap(api.startBrowserLogin(accountId));
    showToast(advance ? t('toast.prelogin', { label }) : t('toast.browserLogin', { label }));
  } catch (err) {
    showToast(err.message, true);
    reloginAccountId = null;
  }
}

function openExportDialog() {
  const ids = selectedIds.size ? [...selectedIds] : allAccounts.map((a) => a.id);
  exportDialog.dataset.ids = JSON.stringify(ids);
  $('#export-count-hint').textContent = t('exportDialog.hint', { n: ids.length });
  $('#export-encrypt').checked = false;
  $('#export-password').value = '';
  $('#export-password-wrap').classList.add('hidden');
  exportDialog.showModal();
}

function resetImportDialog() {
  importPending = null;
  $('#import-mode').value = 'skip';
  $('#import-password').value = '';
  $('#import-password-wrap').classList.add('hidden');
  const fileHint = $('#import-file-hint');
  fileHint.textContent = '';
  fileHint.classList.add('hidden');
  $('#btn-import-confirm').textContent = t('importDialog.pickFile');
}

function openImportDialog() {
  resetImportDialog();
  importDialog.showModal();
}

async function finishImport(content, mode, password) {
  const btn = $('#btn-import-confirm');
  const prevLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('importDialog.importing');
  try {
    const result = await unwrap(api.importAccountsContent({ content, mode, password }));
    if (!result) return;
    const parts = [];
    if (result.imported) parts.push(t('toast.importAdded', { n: result.imported }));
    if (result.updated) parts.push(t('toast.importUpdated', { n: result.updated }));
    if (result.skipped) parts.push(t('toast.importSkipped', { n: result.skipped }));
    importDialog.close();
    resetImportDialog();
    switchPage('accounts');
    showToast(parts.length ? parts.join(listSep()) : t('toast.importNone'), !result.imported && !result.updated);
    await refreshAccounts({ syncMessage: t('sync.importedSync') });
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

async function openDetailDialog(id) {
  const a = allAccounts.find((x) => x.id === id);
  if (!a) return;
  $('#detail-account-id').value = id;
  $('#detail-group').value = a.group || '';
  $('#detail-note').value = a.note || '';
  $('#detail-machine-id').textContent = a.machineId || t('common.notBound');
  detailDialog.showModal();
}

/* ── Events ── */
$$('.nav-item').forEach((btn) => btn.addEventListener('click', () => switchPage(btn.dataset.page)));

$$('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    quotaFilter = chip.dataset.filter;
    $$('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderUI();
  });
});

$('#account-search').addEventListener('input', (e) => { accountSearch = e.target.value; renderUI(); });
$('#account-sort').addEventListener('change', (e) => { accountSort = e.target.value; renderUI(); });

$('#select-all-accounts').addEventListener('change', (e) => {
  const visible = filterAccounts(allAccounts).map((a) => a.id);
  if (e.target.checked) visible.forEach((id) => selectedIds.add(id));
  else visible.forEach((id) => selectedIds.delete(id));
  renderUI();
});

document.body.addEventListener('change', (e) => {
  if (e.target.classList.contains('account-select')) {
    const id = e.target.dataset.id;
    if (e.target.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    syncSelectAllCheckbox();
    renderUI();
  }
});

document.body.addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'open-add') openAddDialog();

  const refreshOne = e.target.closest('.btn-refresh-one');
  if (refreshOne) {
    if (refreshOne.disabled) return;
    refreshOne.disabled = true;
    try {
      await refreshOneAccountUsage(refreshOne.dataset.id);
    } finally {
      const btn = document.querySelector(`.btn-refresh-one[data-id="${refreshOne.dataset.id}"]`);
      if (btn) btn.disabled = false;
    }
    return;
  }

  const refreshTokenBtn = e.target.closest('.btn-refresh-token');
  if (refreshTokenBtn) {
    refreshTokenBtn.disabled = true;
    refreshTokenBtn.textContent = t('common.refreshing');
    try {
      const result = await unwrap(api.refreshAccountToken(refreshTokenBtn.dataset.id));
      showToast(
        result.stillExpiringSoon
          ? t('toast.tokenRefreshedStillExpiring')
          : t('toast.tokenRefreshed'),
        !!result.stillExpiringSoon
      );
      await refreshAccounts();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      refreshTokenBtn.disabled = false;
      refreshTokenBtn.textContent = t('accounts.refreshToken');
    }
    return;
  }

  const refreshTokenAlertBtn = e.target.closest('.btn-refresh-token-alert');
  if (refreshTokenAlertBtn) {
    const btn = refreshTokenAlertBtn;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('common.refreshing');
    try {
      const result = await unwrap(api.refreshAccountToken(btn.dataset.id));
      showToast(
        result.stillExpiringSoon
          ? t('toast.tokenRefreshedStillExpiring')
          : t('toast.tokenRefreshed'),
        !!result.stillExpiringSoon
      );
      await refreshAccounts();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
    return;
  }

  const reloginBtn = e.target.closest('.btn-relogin, .btn-relogin-alert');
  if (reloginBtn) {
    const account = allAccounts.find((a) => a.id === reloginBtn.dataset.id);
    const advance = !!(account?.tokenExpiringSoon && !account?.tokenExpired);
    await startRelogin(reloginBtn.dataset.id, { advance });
    return;
  }

  const detailBtn = e.target.closest('.btn-detail');
  if (detailBtn) { await openDetailDialog(detailBtn.dataset.id); return; }

  const switchBtn = e.target.closest('.btn-switch-account');
  if (switchBtn) {
    switchBtn.disabled = true;
    switchBtn.textContent = '…';
    try { await handleSwitch(switchBtn.dataset.id); }
    catch (err) { showToast(err.message, true); switchBtn.disabled = false; switchBtn.textContent = t('common.switch'); }
    return;
  }

  const cleanSwitchBtn = e.target.closest('.btn-clean-switch');
  if (cleanSwitchBtn) {
    cleanSwitchBtn.disabled = true;
    try { await handleCleanSwitch(cleanSwitchBtn.dataset.id); }
    catch (err) { showToast(err.message, true); }
    finally { cleanSwitchBtn.disabled = false; }
    return;
  }

  const removeBtn = e.target.closest('.btn-remove');
  if (removeBtn) {
    if (!confirm(t('confirm.deleteAccount'))) return;
    try {
      delete usageMap[removeBtn.dataset.id];
      selectedIds.delete(removeBtn.dataset.id);
      await unwrap(api.removeAccount(removeBtn.dataset.id));
      showToast(t('toast.deleted'));
      await refreshAccounts();
    } catch (err) { showToast(err.message, true); }
  }
});

async function handleRefresh(btn) {
  const label = t('common.refreshUsage');
  btn.disabled = true;
  btn.textContent = t('common.refreshing');
  try { await loadAllUsage(); showToast(t('toast.usageRefreshed')); }
  catch (err) { showToast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = label; }
}

const disclaimerDialog = $('#disclaimer-dialog');
let disclaimerRequired = false;

function setDisclaimerMode(required) {
  disclaimerRequired = required;
  $('#btn-disclaimer-decline').classList.toggle('hidden', !required);
  $('#btn-disclaimer-accept').textContent = required ? t('disclaimer.accept') : t('common.close');
}

function showDisclaimer({ required = false } = {}) {
  if (!disclaimerDialog) return;
  setDisclaimerMode(required);
  disclaimerDialog.showModal();
}

async function ensureDisclaimerAccepted() {
  if (appSettings.disclaimerAccepted) return true;
  showDisclaimer({ required: true });
  return new Promise((resolve) => {
    disclaimerDialog._resolveDisclaimer = resolve;
  });
}

function handleDisclaimerAccept() {
  if (disclaimerRequired) {
    saveSettings({
      disclaimerAccepted: true,
      disclaimerAcceptedAt: Date.now(),
    }).then(() => {
      disclaimerDialog.close();
      if (disclaimerDialog._resolveDisclaimer) {
        disclaimerDialog._resolveDisclaimer(true);
        disclaimerDialog._resolveDisclaimer = null;
      }
    });
  } else {
    disclaimerDialog.close();
  }
}

function handleDisclaimerDecline() {
  api.quitApp();
}

$('#btn-refresh-usage').addEventListener('click', (e) => handleRefresh(e.target));
$('#btn-refresh-overview').addEventListener('click', (e) => handleRefresh(e.target));
function initAccountsSwitchTip() {
  const tip = $('#accounts-switch-tip');
  if (!tip) return;
  try {
    if (localStorage.getItem('traehop-switch-tip-dismissed') === '1') {
      tip.classList.add('hidden');
    }
  } catch { /* */ }
}

$('#btn-dismiss-switch-tip')?.addEventListener('click', () => {
  $('#accounts-switch-tip')?.classList.add('hidden');
  try { localStorage.setItem('traehop-switch-tip-dismissed', '1'); } catch { /* */ }
});

$('#btn-add').addEventListener('click', openAddDialog);
$('#btn-theme-toggle').addEventListener('click', toggleTheme);

$$('.theme-segment-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    saveSettings({ theme: btn.dataset.theme });
  });
});

$('#btn-export-accounts').addEventListener('click', openExportDialog);
$('#btn-import-file').addEventListener('click', openImportDialog);

$('#export-encrypt').addEventListener('change', (e) => {
  $('#export-password-wrap').classList.toggle('hidden', !e.target.checked);
});

$('#btn-export-cancel').addEventListener('click', () => exportDialog.close());
$('#btn-export-close').addEventListener('click', () => exportDialog.close());
$('#btn-export-confirm').addEventListener('click', async () => {
  const ids = JSON.parse(exportDialog.dataset.ids || '[]');
  const encrypt = $('#export-encrypt').checked;
  const password = $('#export-password').value;
  if (encrypt && password.length < 6) { showToast(t('toast.passwordMin6'), true); return; }
  try {
    const result = await unwrap(api.exportAccounts({ ids, password: encrypt ? password : '' }));
    if (result) showToast(t('toast.exported', { n: result.count }) + (result.encrypted ? t('toast.exportedEncrypted') : ''));
    exportDialog.close();
  } catch (err) { showToast(err.message, true); }
});

$('#btn-import-cancel').addEventListener('click', () => {
  importDialog.close();
  resetImportDialog();
});
$('#btn-import-close').addEventListener('click', () => {
  importDialog.close();
  resetImportDialog();
});
$('#btn-import-confirm').addEventListener('click', async () => {
  const btn = $('#btn-import-confirm');
  const mode = $('#import-mode').value;
  const password = $('#import-password').value;

  try {
    btn.disabled = true;

    if (!importPending) {
      const picked = await unwrap(api.pickImportFile());
      if (!picked) return;

      importPending = picked;
      const fileHint = $('#import-file-hint');
      fileHint.textContent = t('importDialog.picked', {
        name: picked.fileName,
        encrypted: picked.encrypted ? t('importDialog.encryptedSuffix') : '',
      });
      fileHint.classList.remove('hidden');

      if (picked.encrypted) {
        $('#import-password-wrap').classList.remove('hidden');
        btn.textContent = t('common.import');
        $('#import-password').focus();
        return;
      }
    }

    if (importPending.encrypted && !password.trim()) {
      showToast(t('toast.enterDecryptPassword'), true);
      $('#import-password').focus();
      return;
    }

    await finishImport(importPending.content, mode, password);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#btn-detail-cancel').addEventListener('click', () => detailDialog.close());
$('#btn-detail-close').addEventListener('click', () => detailDialog.close());
$('#btn-detail-save').addEventListener('click', async () => {
  const id = $('#detail-account-id').value;
  try {
    await unwrap(api.updateAccountMeta(id, {
      group: $('#detail-group').value,
      note: $('#detail-note').value,
    }));
    detailDialog.close();
    showToast(t('toast.saved'));
    await refreshAccounts();
  } catch (err) { showToast(err.message, true); }
});

$('#btn-bind-machine').addEventListener('click', async () => {
  const id = $('#detail-account-id').value;
  try {
    const r = await unwrap(api.bindMachineId(id));
    $('#detail-machine-id').textContent = r.machineId;
    showToast(t('toast.bound'));
    await refreshAccounts();
  } catch (err) { showToast(err.message, true); }
});

$('#btn-regen-machine').addEventListener('click', async () => {
  const id = $('#detail-account-id').value;
  if (!confirm(t('detailDialog.regenConfirm'))) return;
  try {
    const r = await unwrap(api.regenerateMachineId(id));
    $('#detail-machine-id').textContent = r.machineId;
    showToast(t('toast.regenerated'));
    await refreshAccounts();
  } catch (err) { showToast(err.message, true); }
});

$('#btn-import-trae').addEventListener('click', async () => {
  const btn = $('#btn-import-trae');
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t('importDialog.importing');
  try {
    const result = await unwrap(api.importFromTrae());
    showToast(t('toast.imported', { email: result.account.email || result.account.name }));
    await refreshAccounts({ syncMessage: t('sync.importing') });
  } catch (err) { showToast(err.message, true); }
  finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
});

$$('.add-tab').forEach((tab) => tab.addEventListener('click', () => setAddMode(tab.dataset.mode)));
$('#btn-dialog-close').addEventListener('click', closeAddDialog);
$('#btn-cancel-add').addEventListener('click', closeAddDialog);
addDialog.addEventListener('click', (e) => { if (e.target === addDialog) closeAddDialog(); });
addDialog.addEventListener('cancel', (e) => { e.preventDefault(); closeAddDialog(); });

$('#btn-submit-add').addEventListener('click', async () => {
  const btn = $('#btn-submit-add');
  const payload = extractTokenPayload($('#token-input').value);
  if (!payload?.token) { showToast(t('toast.invalidToken'), true); return; }
  btn.disabled = true;
  btn.textContent = t('addDialog.adding');
  try {
    await unwrap(api.addAccount(payload.token, payload.tokenExpiredAt || undefined));
    await closeAddDialog();
    switchPage('accounts');
    showToast(t('toast.added'));
    await refreshAccounts({ syncMessage: t('sync.adding') });
  } catch (err) { showToast(err.message, true); }
  finally {
    btn.disabled = false;
    btn.textContent = t('addDialog.submit');
  }
});

$('#btn-import-in-dialog').addEventListener('click', async () => {
  const btn = $('#btn-import-in-dialog');
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t('importDialog.importing');
  try {
    const result = await unwrap(api.importFromTrae());
    await closeAddDialog();
    switchPage('accounts');
    showToast(t('toast.imported', { email: result.account.email || result.account.name }));
    await refreshAccounts({ syncMessage: t('sync.importing') });
  } catch (err) { showToast(err.message, true); }
  finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
});

$('#btn-browser-login').addEventListener('click', async () => {
  $('#btn-browser-login').disabled = true;
  browserLoginActive = true;
  updateAddDialogFooter();
  const status = $('#browser-login-status');
  status.classList.remove('hidden');
  status.textContent = t('addDialog.loginWaiting');
  try { await unwrap(api.startBrowserLogin()); }
  catch (err) { status.textContent = err.message; resetBrowserLoginState(); }
});

$('#btn-cancel-browser').addEventListener('click', async () => {
  await api.cancelBrowserLogin().catch(() => {});
  resetBrowserLoginState();
});

api.onLoginSuccess(async (data) => {
  const wasRelogin = !!reloginAccountId;
  resetBrowserLoginState();
  if (addDialog.open) addDialog.close();
  showToast(wasRelogin ? t('toast.tokenUpdated') : t('toast.loginSuccess', { email: data.email || t('toast.newAccount') }));
  reloginAccountId = null;
  if (!wasRelogin) switchPage('accounts');
  try {
    await refreshAccounts({
      syncMessage: wasRelogin ? t('sync.updating') : t('sync.adding'),
    });
  } catch (err) {
    showToast(err.message, true);
  }
});
api.onLoginFailed((msg) => {
  resetBrowserLoginState();
  $('#browser-login-status').classList.remove('hidden');
  $('#browser-login-status').textContent = msg;
});
api.onLoginCancelled(resetBrowserLoginState);
api.onTraeAccountChanged(scheduleRefreshAccounts);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleRefreshAccounts();
});

$('#btn-scan-path').addEventListener('click', async () => {
  try { cachedTraePath = await unwrap(api.scanTraePath()); traePathEl.textContent = cachedTraePath; showToast(t('toast.traeFound')); }
  catch (err) { showToast(err.message, true); }
});

$('#btn-pick-path').addEventListener('click', async () => {
  try {
    const p = await unwrap(api.pickTraePath());
    if (p) { cachedTraePath = p; traePathEl.textContent = p; showToast(t('toast.pathSaved')); }
  } catch (err) { showToast(err.message, true); }
});

$('#setting-language').addEventListener('change', async (e) => {
  const lang = e.target.value;
  window.TraeHopI18n.setLocale(lang);
  await saveSettings({ language: lang });
  applyTheme(appSettings.theme);
  updateAutoRefreshStatus();
  refreshSettingsLabels();
  setDisclaimerMode(disclaimerRequired);
  setCleanRunning(cleanCleaning);
  renderUI();
  loadUsageHistory();
});

$('#setting-auto-refresh').addEventListener('change', (e) => saveSettings({ autoRefreshEnabled: e.target.checked }));
$('#setting-interval').addEventListener('change', (e) => saveSettings({ autoRefreshIntervalMinutes: Math.max(5, Number(e.target.value)) }));
$('#setting-notify-quota').addEventListener('change', (e) => saveSettings({ notifyLowQuota: e.target.checked }));
$('#setting-notify-expiry').addEventListener('change', async (e) => {
  await saveSettings({ notifyTokenExpiry: e.target.checked });
  renderExpiryAlerts();
});
$('#setting-quota-threshold').addEventListener('change', (e) => saveSettings({ lowQuotaThreshold: Number(e.target.value) }));
$('#setting-auto-backup').addEventListener('change', (e) => saveSettings({ autoBackupEnabled: e.target.checked }));
$('#setting-backup-interval').addEventListener('change', (e) => saveSettings({ autoBackupIntervalHours: Number(e.target.value) }));

$('#btn-pick-backup-dir').addEventListener('click', async () => {
  try {
    const dir = await unwrap(api.pickBackupDir());
    if (dir) {
      await saveSettings({ autoBackupDir: dir });
      $('#backup-dir').textContent = dir;
      showToast(t('toast.backupDirSaved'));
    }
  } catch (err) { showToast(err.message, true); }
});

$('#btn-backup-now').addEventListener('click', async () => {
  try {
    const r = await unwrap(api.runBackupNow());
    if (r.skipped) { showToast(r.reason, true); return; }
    showToast(t('toast.backupDone', { n: r.count }));
    lastBackupTs = Date.now();
    refreshSettingsLabels();
  } catch (err) { showToast(err.message, true); }
});

$('#btn-rescan-clean').addEventListener('click', () => { cleanScanned = false; scanCleanSize(); });
$('#btn-start-clean').addEventListener('click', handleClean);
$('#btn-cancel-clean').addEventListener('click', () => api.cancelClean());

$('#btn-show-disclaimer').addEventListener('click', () => showDisclaimer({ required: false }));
$('#btn-disclaimer-accept').addEventListener('click', handleDisclaimerAccept);
$('#btn-disclaimer-decline').addEventListener('click', handleDisclaimerDecline);
disclaimerDialog?.addEventListener('cancel', (e) => {
  if (disclaimerRequired) e.preventDefault();
});
disclaimerDialog?.addEventListener('click', (e) => {
  if (disclaimerRequired && e.target === disclaimerDialog) e.preventDefault();
});

window.addEventListener('traehop:localechange', () => {
  applyTheme(appSettings.theme);
  updateAutoRefreshStatus();
  refreshSettingsLabels();
  setDisclaimerMode(disclaimerRequired);
  setCleanRunning(cleanCleaning);
  renderUI();
  if (currentPage === 'overview') loadUsageHistory();
});

(async () => {
  try {
    await window.TraeHopI18n.ready;
    initAccountsSwitchTip();
    await loadSettings();
    if (!appSettings.language) await saveSettings({ language: window.TraeHopI18n.getLocale() });
    await ensureDisclaimerAccepted();
    await loadTraePath();
    await refreshAccounts();
    const p = await unwrap(api.getTraePath());
    if (!p) {
      try {
        cachedTraePath = await unwrap(api.scanTraePath());
        traePathEl.textContent = cachedTraePath;
      } catch { /* */ }
    }
  } catch (err) {
    initialLoading = false;
    renderUI();
    showToast(err.message, true);
  }
})();

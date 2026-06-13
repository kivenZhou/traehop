(function () {
  const STORAGE_KEY = 'traehop-lang';
  let locale = 'zh';
  const messages = { zh: null, en: null };

  function detectLocale() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  function interpolate(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
  }

  function t(key, params) {
    const str = get(messages[locale], key) ?? get(messages.en, key) ?? key;
    return interpolate(str, params);
  }

  function applyDomI18n(root = document) {
    const textPairs = [
      ['#brand-sub', 'brand.subtitle'],
      ['#page-overview .page-header h1', 'overview.title'],
      ['#page-overview .page-desc', 'overview.desc'],
      ['#btn-refresh-overview', 'common.refreshUsage'],
      ['#overview-loading .loading-text', 'overview.detecting'],
      ['#overview-empty .empty-title', 'overview.emptyTitle'],
      ['#overview-empty .empty-desc', 'overview.emptyDesc'],
      ['#overview-empty [data-action="open-add"]', 'overview.addFirst'],
      ['#page-overview .strip-stat:nth-child(1) .strip-label', 'overview.totalAccounts'],
      ['#page-overview .strip-stat.strip-ok .strip-label', 'overview.withQuota'],
      ['#page-overview .strip-stat.strip-warn .strip-label', 'overview.noQuota'],
      ['#page-overview .strip-stat.strip-accent .strip-label', 'overview.totalLeft'],
      ['#page-overview .strip-stat.strip-usage .strip-label', 'overview.totalUsage'],
      ['#page-overview .usage-panel h3', 'overview.usageOverview'],
      ['#page-overview .ring-label', 'overview.used'],
      ['#page-overview .usage-detail div:nth-child(1) span', 'overview.usedLabel'],
      ['#page-overview .usage-detail div:nth-child(2) span', 'overview.limitLabel'],
      ['#page-overview .info-panel h3', 'overview.otherInfo'],
      ['#page-overview .info-row:nth-child(1) span', 'overview.tokenExpired'],
      ['#page-overview .info-row:nth-child(2) span', 'overview.expiringSoon'],
      ['#page-overview .info-row:nth-child(3) span', 'overview.lastReset'],
      ['#page-overview .info-row:nth-child(4) span', 'overview.lastRefresh'],
      ['#expiry-alerts h3', 'overview.needsAttention'],
      ['#page-overview .history-panel h3', 'overview.usageHistory'],
      ['#page-overview .history-header span:nth-child(1)', 'overview.historyEmail'],
      ['#page-overview .history-header span:nth-child(2)', 'overview.historyLeft'],
      ['#page-overview .history-header span:nth-child(3)', 'overview.historyTime'],
      ['#page-accounts .page-header h1', 'accounts.title'],
      ['#page-accounts .page-desc', 'accounts.desc'],
      ['#btn-export-accounts', 'common.export'],
      ['#btn-import-file', 'common.import'],
      ['#btn-import-trae', 'accounts.importFromTrae'],
      ['#btn-refresh-usage', 'common.refreshUsage'],
      ['#page-clean .page-header h1', 'clean.title'],
      ['#page-clean .page-desc', 'clean.desc'],
      ['#btn-rescan-clean', 'clean.rescan'],
      ['#page-clean .clean-scan-card .clean-card-title', 'clean.spaceTitle'],
      ['#page-clean .clean-guide-card > .clean-card-title', 'clean.guideTitle'],
      ['#page-clean .clean-warning', 'clean.warning'],
      ['#page-clean .clean-steps li:nth-child(1)', 'clean.step1'],
      ['#page-clean .clean-steps li:nth-child(2)', 'clean.step2'],
      ['#page-clean .clean-steps li:nth-child(3)', 'clean.step3'],
      ['#btn-start-clean', 'clean.start'],
      ['#btn-cancel-clean', 'clean.cancel'],
      ['#page-clean .clean-log-card > .clean-card-title', 'clean.logTitle'],
      ['#page-settings .page-header h1', 'settings.title'],
      ['#page-settings .page-desc', 'settings.desc'],
      ['#page-settings .settings-group:nth-child(1) h3', 'settings.appearance'],
      ['#page-settings .settings-group:nth-child(1) .settings-desc', 'settings.appearanceDesc'],
      ['#page-settings .settings-group:nth-child(2) h3', 'settings.language'],
      ['#page-settings .settings-group:nth-child(2) .settings-desc', 'settings.languageDesc'],
      ['#page-settings .settings-group:nth-child(3) h3', 'settings.traePath'],
      ['#page-settings .settings-group:nth-child(3) .settings-desc', 'settings.traePathDesc'],
      ['#btn-scan-path', 'settings.autoScan'],
      ['#btn-pick-path', 'settings.pick'],
      ['#page-settings .settings-group:nth-child(4) h3', 'settings.privacy'],
      ['#page-settings .settings-group:nth-child(4) .settings-desc', 'settings.privacyDesc'],
      ['#btn-show-disclaimer', 'settings.showDisclaimer'],
      ['#page-settings .settings-group:nth-child(5) h3', 'settings.usageMonitor'],
      ['#page-settings .settings-group:nth-child(5) .settings-desc', 'settings.usageMonitorDesc'],
      ['#page-settings .settings-group:nth-child(5) .toggle-row span', 'settings.autoRefresh'],
      ['#page-settings .settings-group:nth-child(5) .setting-row label', 'settings.refreshInterval'],
      ['#page-settings .settings-group:nth-child(6) h3', 'settings.notifications'],
      ['#page-settings .settings-group:nth-child(6) .settings-desc', 'settings.notificationsDesc'],
      ['#page-settings .settings-group:nth-child(6) .toggle-row:nth-child(3) span', 'settings.notifyLowQuota'],
      ['#page-settings .settings-group:nth-child(6) .setting-row label', 'settings.quotaBelow'],
      ['#page-settings .settings-group:nth-child(6) .toggle-row:nth-child(5) span', 'settings.notifyExpiry'],
      ['#page-settings .settings-group:nth-child(7) h3', 'settings.autoBackup'],
      ['#page-settings .settings-group:nth-child(7) .settings-desc', 'settings.autoBackupDesc'],
      ['#page-settings .settings-group:nth-child(7) .toggle-row span', 'settings.enableAutoBackup'],
      ['#page-settings .settings-group:nth-child(7) .setting-row label', 'settings.backupInterval'],
      ['#btn-pick-backup-dir', 'settings.pickDir'],
      ['#btn-backup-now', 'settings.backupNow'],
      ['#add-dialog h2', 'addDialog.title'],
      ['#export-dialog h2', 'exportDialog.title'],
      ['#import-dialog h2', 'importDialog.title'],
      ['#account-detail-dialog h2', 'detailDialog.title'],
      ['#disclaimer-dialog h2', 'disclaimer.title'],
      ['#disclaimer-dialog .disclaimer-content p', 'disclaimer.p1'],
      ['#disclaimer-dialog .disclaimer-list li:nth-child(1)', 'disclaimer.li1'],
      ['#disclaimer-dialog .disclaimer-list li:nth-child(2)', 'disclaimer.li2'],
      ['#disclaimer-dialog .disclaimer-list li:nth-child(3)', 'disclaimer.li3'],
      ['#disclaimer-dialog .disclaimer-list li:nth-child(4)', 'disclaimer.li4'],
      ['#disclaimer-dialog .disclaimer-list li:nth-child(5)', 'disclaimer.li5'],
      ['#disclaimer-dialog .disclaimer-footer', 'disclaimer.footer'],
      ['#btn-disclaimer-decline', 'disclaimer.decline'],
    ];
    textPairs.forEach(([sel, key]) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = t(key);
    });

    root.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
      const page = btn.dataset.page;
      const key = page === 'overview' ? 'nav.overview' : page === 'accounts' ? 'nav.accounts' : page === 'clean' ? 'nav.clean' : 'nav.settings';
      const span = btn.querySelector('span:not(.nav-badge)');
      if (span) span.textContent = t(key);
    });

    const themeBtn = root.querySelector('#btn-theme-toggle');
    if (themeBtn) themeBtn.title = t('theme.toggle');
    const addBtn = root.querySelector('#btn-add');
    if (addBtn) {
      const svg = addBtn.querySelector('svg');
      addBtn.textContent = '';
      if (svg) addBtn.appendChild(svg);
      addBtn.append(` ${t('common.addAccount')}`);
    }

    const themeSeg = root.querySelectorAll('.theme-segment-btn');
    if (themeSeg[0]) themeSeg[0].lastChild.textContent = ` ${t('theme.light')}`;
    if (themeSeg[1]) themeSeg[1].lastChild.textContent = ` ${t('theme.dark')}`;

    const sort = root.querySelector('#account-sort');
    if (sort) {
      const opts = ['accounts.sortDefault', 'accounts.sortQuotaDesc', 'accounts.sortQuotaAsc', 'accounts.sortName', 'accounts.sortExpiry'];
      [...sort.options].forEach((o, i) => { if (opts[i]) o.textContent = t(opts[i]); });
    }

    const filters = ['all', 'has-quota', 'no-quota', 'expiring-soon', 'expired'];
    const fkeys = ['accounts.filterAll', 'accounts.filterHasQuota', 'accounts.filterNoQuota', 'accounts.filterExpiring', 'accounts.filterExpired'];
    root.querySelectorAll('.filter-chip[data-filter]').forEach((btn, i) => { btn.textContent = t(fkeys[i]); });
    const selectAll = root.querySelector('.select-all-row span');
    if (selectAll) selectAll.textContent = t('common.selectAll');

    const tip = root.querySelector('.accounts-tip-title');
    if (tip) tip.textContent = t('accounts.tipTitle');
    const tipItems = root.querySelectorAll('.accounts-tip-item');
    if (tipItems[0]) tipItems[0].innerHTML = `<strong>${t('common.switch')}</strong> ${t('accounts.tipSwitch')}`;
    if (tipItems[1]) tipItems[1].innerHTML = `<strong>${t('accounts.cleanSwitch')}</strong>${t('accounts.tipCleanSwitch')}`;

    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });

    const interval = root.querySelector('#setting-interval');
    if (interval) {
      const keys = ['settings.min5', 'settings.min10', 'settings.min15', 'settings.min30', 'settings.min60'];
      [...interval.options].forEach((o, i) => { o.textContent = t(keys[i]); });
    }
    const backupInt = root.querySelector('#setting-backup-interval');
    if (backupInt) {
      const keys = ['settings.hours6', 'settings.hours12', 'settings.hours24', 'settings.days7'];
      [...backupInt.options].forEach((o, i) => { o.textContent = t(keys[i]); });
    }
    const importMode = root.querySelector('#import-mode');
    if (importMode) {
      const keys = ['importDialog.skip', 'importDialog.overwrite', 'importDialog.duplicate'];
      [...importMode.options].forEach((o, i) => { o.textContent = t(keys[i]); });
    }

    applyAddDialogI18n(root);
    applyExportImportDetailI18n(root);

    const cleanLog = root.querySelector('#clean-log');
    if (cleanLog) cleanLog.dataset.placeholder = t('clean.logPlaceholder');
    const dismissTip = root.querySelector('#btn-dismiss-switch-tip');
    if (dismissTip) {
      dismissTip.title = t('accounts.tipDismiss');
      dismissTip.setAttribute('aria-label', t('common.close'));
    }

    const langLabel = root.querySelector('label[for="setting-language"]');
    if (langLabel) langLabel.textContent = t('settings.language');

    const langSelect = root.querySelector('#setting-language');
    if (langSelect) {
      const opts = langSelect.options;
      if (opts[0]) opts[0].textContent = t('settings.langZh');
      if (opts[1]) opts[1].textContent = t('settings.langEn');
      if (langSelect.value !== locale) langSelect.value = locale;
    }
  }

  function applyAddDialogI18n(root) {
    const tabs = ['addDialog.browser', 'addDialog.token', 'addDialog.fromTrae'];
    root.querySelectorAll('.add-tab').forEach((tab, i) => { tab.textContent = t(tabs[i]); });
    const pairs = [
      ['#panel-browser .tips-card h3', 'addDialog.browserTitle'],
      ['#panel-browser .tips-steps li:nth-child(1)', 'addDialog.browserStep1'],
      ['#panel-browser .tips-steps li:nth-child(2)', 'addDialog.browserStep2'],
      ['#panel-browser .tips-steps li:nth-child(3)', 'addDialog.browserStep3'],
      ['#btn-browser-login', 'addDialog.openBrowser'],
      ['#panel-token .tips-card h3', 'addDialog.tokenTitle'],
      ['#panel-token summary', 'addDialog.tokenHow'],
      ['#panel-token .tips-steps li:nth-child(1)', 'addDialog.tokenStep1'],
      ['#panel-token .tips-steps li:nth-child(2)', 'addDialog.tokenStep2'],
      ['#panel-token .tips-steps li:nth-child(3)', 'addDialog.tokenStep3'],
      ['#panel-token label > span', 'addDialog.tokenLabel'],
      ['#panel-trae .tips-card h3', 'addDialog.traeTitle'],
      ['#panel-trae .tips-steps li:nth-child(1)', 'addDialog.traeStep1'],
      ['#panel-trae .tips-steps li:nth-child(2)', 'addDialog.traeStep2'],
      ['#panel-trae .tips-steps li:nth-child(3)', 'addDialog.traeStep3'],
      ['#btn-import-in-dialog', 'addDialog.importCurrent'],
      ['#btn-cancel-add', 'common.cancel'],
      ['#btn-submit-add', 'addDialog.submit'],
      ['#btn-cancel-browser', 'addDialog.cancelLogin'],
    ];
    pairs.forEach(([sel, key]) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = t(key);
    });
    const tokenInput = root.querySelector('#token-input');
    if (tokenInput) tokenInput.placeholder = t('addDialog.tokenPlaceholder');
  }

  function applyExportImportDetailI18n(root) {
    const pairs = [
      ['#export-dialog .toggle-row span', 'exportDialog.encrypt'],
      ['#export-password-wrap span', 'exportDialog.password'],
      ['#btn-export-cancel', 'common.cancel'],
      ['#btn-export-confirm', 'common.export'],
      ['#import-dialog label > span', 'importDialog.duplicate'],
      ['#import-password-wrap span', 'importDialog.decryptPassword'],
      ['#import-hint-text', 'importDialog.hint'],
      ['#btn-import-cancel', 'common.cancel'],
      ['#account-detail-dialog .dialog-content > label:nth-child(2) span', 'detailDialog.group'],
      ['#account-detail-dialog .dialog-content > label:nth-child(3) span', 'detailDialog.note'],
      ['#account-detail-dialog .detail-machine > span', 'detailDialog.machineId'],
      ['#account-detail-dialog .detail-machine-warning', 'detailDialog.machineWarn'],
      ['#btn-bind-machine', 'detailDialog.bindMachine'],
      ['#btn-regen-machine', 'detailDialog.regenMachine'],
      ['#btn-detail-cancel', 'common.cancel'],
      ['#btn-detail-save', 'common.save'],
    ];
    pairs.forEach(([sel, key]) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = t(key);
    });
    const expPass = root.querySelector('#export-password');
    if (expPass) expPass.placeholder = t('exportDialog.passwordPlaceholder');
    const impPass = root.querySelector('#import-password');
    if (impPass) impPass.placeholder = t('importDialog.decryptPlaceholder');
    const grp = root.querySelector('#detail-group');
    if (grp) grp.placeholder = t('detailDialog.groupPlaceholder');
    const note = root.querySelector('#detail-note');
    if (note) note.placeholder = t('detailDialog.notePlaceholder');
    const search = root.querySelector('#account-search');
    if (search) search.placeholder = t('accounts.searchPlaceholder');
  }

  function setLocale(next, { persist = true } = {}) {
    if (next !== 'zh' && next !== 'en') return;
    locale = next;
    if (persist) localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    applyDomI18n();
    window.dispatchEvent(new CustomEvent('traehop:localechange', { detail: { locale: next } }));
  }

  function initI18n(preferred) {
    locale = preferred === 'zh' || preferred === 'en' ? preferred : detectLocale();
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    applyDomI18n();
    return locale;
  }

  const ready = Promise.all([
    fetch('./locales/zh.json').then((r) => r.json()),
    fetch('./locales/en.json').then((r) => r.json()),
  ]).then(([zh, en]) => {
    messages.zh = zh;
    messages.en = en;
  });

  window.TraeHopI18n = {
    ready,
    t,
    setLocale,
    getLocale: () => locale,
    applyDomI18n,
    initI18n,
    detectLocale,
  };
})();

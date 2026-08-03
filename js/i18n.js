// js/i18n.js — tiny zero-dep i18n runtime: en/id/zh, interpolation, fallback (TODO 12)
(function () {
  const LOCALES = ['en', 'id', 'zh'];
  const STORAGE_KEY = 'netutils-lang';
  const dicts = {};
  let current = null;

  function detect() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES.includes(stored)) return stored;
    const params = new URLSearchParams(location.search);
    const param = params.get('lang');
    if (param && LOCALES.includes(param)) return param;
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('id')) return 'id';
    if (nav.startsWith('zh')) return 'zh';
    return 'en';
  }

  function interpolate(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  }

  function t(key, vars) {
    const d = dicts[current] || {};
    if (!(key in d)) {
      const en = dicts.en || {};
      if (!(key in en)) {
        if (current !== 'en') console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(en[key], vars);
    }
    return interpolate(d[key], vars);
  }

  async function load(locale) {
    if (dicts[locale]) return dicts[locale];
    try {
      const res = await fetch(`/locales/${locale}.json`);
      if (!res.ok) throw new Error(String(res.status));
      dicts[locale] = await res.json();
    } catch {
      dicts[locale] = {};
    }
    return dicts[locale];
  }

  async function apply() {
    current = detect();
    await load('en');
    await load(current);
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : current;
    document.documentElement.setAttribute('data-lang', current);
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    const sel = document.getElementById('lang-select');
    if (sel) sel.value = current;
    window.dispatchEvent(new CustomEvent('localechange', { detail: { locale: current } }));
    const nf = new Intl.NumberFormat(current === 'zh' ? 'zh-CN' : current === 'id' ? 'id-ID' : 'en-US');
    window.I18n.formatNumber = (n) => nf.format(n);
  }

  window.I18n = {
    t,
    locale: () => current,
    set(locale) {
      localStorage.setItem(STORAGE_KEY, locale);
      apply();
    },
    loaded: () => !!current,
    missingKeys: () => Object.keys(dicts[current] || {})
  };
  document.addEventListener('DOMContentLoaded', apply);
})();

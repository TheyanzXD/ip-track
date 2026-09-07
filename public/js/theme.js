// js/theme.js — Theme Engine: light/dark/system + system sync + flash prevention (TODO 13)
(function () {
  const STORAGE_KEY = 'netutils-theme';
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  function resolve(mode) {
    if (mode === 'dark' || mode === 'light') return mode;
    return mql.matches ? 'dark' : 'light';
  }
  function currentMode() {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  }
  function apply() {
    const mode = currentMode();
    const theme = resolve(mode);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const icon = document.getElementById('theme-toggle');
    if (icon) icon.setAttribute('data-mode', mode);
  }
  window.Theme = {
    mode: currentMode,
    set(mode) {
      localStorage.setItem(STORAGE_KEY, mode);
      apply();
      window.dispatchEvent(new CustomEvent('themechange', { detail: { mode, theme: resolve(mode) } }));
    },
    cycle() {
      const order = ['light', 'dark', 'system'];
      const next = order[(order.indexOf(currentMode()) + 1) % order.length];
      this.set(next);
      return next;
    },
    get theme() { return resolve(currentMode()); }
  };
  mql.addEventListener('change', apply);
  apply();
})();

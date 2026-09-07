// js/history.js — localStorage lookup history per tool, LRU, export, privacy toggle (TODO 10)
(function () {
  const VERSION = 1;
  const KEY = 'netutils-history';
  const TOGGLE_KEY = 'netutils-history-enabled';
  const MAX_PER_TOOL = 50;
  const PREVIEW_LEN = 120;

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { version: VERSION, tools: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION || !parsed.tools) return { version: VERSION, tools: {} };
      return parsed;
    } catch {
      return { version: VERSION, tools: {} }; // self-heal corrupt data
    }
  }

  function write(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ }
  }

  function preview(result) {
    const s = JSON.stringify(result);
    return s.length > PREVIEW_LEN ? s.slice(0, PREVIEW_LEN) + '…' : s;
  }

  function enabled() {
    return localStorage.getItem(TOGGLE_KEY) !== 'off';
  }

  window.History = {
    enabled,
    setEnabled(on) {
      localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
      if (!on) { localStorage.removeItem(KEY); }
      window.dispatchEvent(new CustomEvent('historychange'));
    },
    add({ tool, query, status, result }) {
      if (!enabled()) return;
      const store = read();
      const list = store.tools[tool] || [];
      list.unshift({ query, type: tool, timestamp: Date.now(), status, resultPreview: preview(result || {}) });
      store.tools[tool] = list.slice(0, MAX_PER_TOOL);
      write(store);
      window.dispatchEvent(new CustomEvent('historychange'));
    },
    list(tool) {
      const store = read();
      return tool ? store.tools[tool] || [] : store.tools;
    },
    recent(tool, n = 5) {
      return this.list(tool).slice(0, n);
    },
    remove(tool, timestamp) {
      const store = read();
      store.tools[tool] = (store.tools[tool] || []).filter(e => e.timestamp !== timestamp);
      write(store);
      window.dispatchEvent(new CustomEvent('historychange'));
    },
    clearAll() {
      localStorage.removeItem(KEY);
      window.dispatchEvent(new CustomEvent('historychange'));
    },
    exportCsv() {
      const store = read();
      const rows = [['tool', 'query', 'timestamp', 'status', 'preview']];
      for (const [tool, entries] of Object.entries(store.tools)) {
        for (const e of entries) rows.push([tool, e.query, new Date(e.timestamp).toISOString(), e.status, e.resultPreview]);
      }
      const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      return csv;
    },
    exportJson() {
      return JSON.stringify(read(), null, 2);
    }
  };
})();

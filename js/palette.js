// js/palette.js — Command Palette: fuzzy search, action catalog, keyboard-first (TODO 14)
(function () {
  const actions = new Map();
  let active = 0;
  let results = [];

  function fuzzy(query, target) {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    // subsequence match
    let ti = 0;
    for (const ch of q) {
      const found = t.indexOf(ch, ti);
      if (found === -1) return false;
      ti = found + 1;
    }
    return true;
  }

  function score(query, target) {
    if (target.toLowerCase().startsWith(query.toLowerCase())) return 100;
    return 50;
  }

  function register(id, { title, keywords = '', run, hint = '' }) {
    actions.set(id, { id, title, keywords, run, hint });
  }

  function open() {
    const input = document.getElementById('palette-input');
    const modal = document.getElementById('palette');
    if (!modal) return;
    modal.classList.add('open');
    input.value = '';
    input.focus();
    render('');
  }

  function close() {
    const modal = document.getElementById('palette');
    if (modal) modal.classList.remove('open');
  }

  function render(query) {
    const list = document.getElementById('palette-list');
    if (!list) return;
    results = [...actions.values()]
      .filter(a => fuzzy(query, a.title + ' ' + a.keywords + ' ' + a.hint))
      .sort((a, b) => score(query, b.title) - score(query, a.title))
      .slice(0, 12);
    active = 0;
    list.innerHTML = results.length === 0
      ? '<div class="palette-empty">No matching actions</div>'
      : results.map((a, i) => `
          <button type="button" class="palette-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
            <span class="palette-title">${escapeHtml(a.title)}</span>
            ${a.hint ? `<span class="palette-hint">${escapeHtml(a.hint)}</span>` : ''}
          </button>`).join('');
    list.querySelectorAll('.palette-item').forEach(btn => {
      btn.addEventListener('click', () => runAction(+btn.dataset.index));
      btn.addEventListener('mousemove', () => select(+btn.dataset.index));
    });
  }

  function select(i) {
    active = (i + results.length) % results.length;
    document.querySelectorAll('.palette-item').forEach((el, idx) => el.classList.toggle('selected', idx === active));
    document.querySelector('.palette-item.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function runAction(i) {
    const action = results[i];
    close();
    if (action) action.run();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.Palette = { register, open, close };

  document.addEventListener('keydown', e => {
    const modal = document.getElementById('palette');
    const isOpen = modal && modal.classList.contains('open');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isOpen) close(); else open();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); runAction(active); return; }
    if (e.key === 'Tab') { e.preventDefault(); select(e.shiftKey ? active - 1 : active + 1); return; }
    render(document.getElementById('palette-input').value);
  });

  document.addEventListener('click', e => {
    const modal = document.getElementById('palette');
    if (modal && modal.classList.contains('open') && e.target === modal) close();
  });
})();

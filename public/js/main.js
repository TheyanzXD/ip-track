// js/main.js — NetUtils v2: 9 tools, SSE streaming, share, AI, history, palette (TODO 04-18)
(function () {
  'use strict';

  const TOOLS = ['ip', 'dns', 'headers', 'portscan', 'ssl', 'whois', 'ct'];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (k, v) => (window.I18n ? window.I18n.t(k, v) : k);

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function show(id) { const el = $(id); el && el.classList.add('active'); }
  function hide(id) { const el = $(id); el && el.classList.remove('active'); }

  async function apiCall(url, opts = {}) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => null);
    if (!body || body.status !== 'success') {
      const code = body?.code || 'ERROR';
      const err = new Error(body?.message || `HTTP ${res.status}`);
      err.code = code;
      err.status = res.status;
      err.data = body?.data;
      throw err;
    }
    return body.data;
  }

  function setLoading(id, on) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('active', on);
    const btn = document.querySelector(`[data-loading="${id}"]`);
    if (btn) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }
  }

  function dataGrid(el, items) {
    el.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'data-item';
      div.innerHTML = `<div class="label">${esc(item.label)}</div><div class="value${item.mono ? ' mono' : ''}">${item.value == null || item.value === '' ? 'N/A' : esc(String(item.value))}</div>`;
      if (item.copy && item.value) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.dataset.copy = String(item.value);
        btn.textContent = 'Copy';
        div.querySelector('.value').appendChild(btn);
      }
      el.appendChild(div);
    });
  }

  // ---------- result action bar (share + AI) ----------
  function actionBar(container, { tool, query, result, aiPayload }) {
    const bar = document.createElement('div');
    bar.className = 'result-actions';
    const shareBtn = document.createElement('button');
    shareBtn.className = 'button button-secondary';
    shareBtn.type = 'button';
    shareBtn.innerHTML = '<i data-lucide="share-2"></i> ' + t('action.share');
    shareBtn.addEventListener('click', () => share.open({ tool, query, result }));
    bar.appendChild(shareBtn);

    if (aiPayload) {
      const aiBtn = document.createElement('button');
      aiBtn.className = 'button button-secondary';
      aiBtn.type = 'button';
      aiBtn.innerHTML = '<i data-lucide="sparkles"></i> ' + t('action.ai');
      aiBtn.addEventListener('click', () => AI.run(aiBtn, tool, aiPayload, container));
      bar.appendChild(aiBtn);
    }
    container.insertBefore(bar, container.firstChild);
    if (window.lucide) lucide.createIcons();
    return bar;
  }

  // ---------- share (TODO 11) ----------
  const share = {
    open({ tool, query, result }) {
      const modal = $('share-modal');
      const payload = { version: 1, tool, query, result };
      const local = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      let url;
      try {
        fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload })
        }).then(r => r.json()).then(j => {
          if (j.status === 'success') {
            $('share-url').value = j.data.url;
          }
        }).catch(() => {});
      } catch { /* offline */ }
      url = `${location.origin}${location.pathname}#/share/${local}`;
      $('share-url').value = url;
      $('share-owner-token').value = '';
      modal.classList.add('open');
      $('share-url').select();
    },
    async resolveLocal(code) {
      try {
        const json = decodeURIComponent(escape(atob(code)));
        return JSON.parse(json);
      } catch { return null; }
    }
  };

  document.addEventListener('click', e => {
    const modal = $('share-modal');
    if (modal && modal.classList.contains('open') && e.target === modal) modal.classList.remove('open');
    const copyShare = e.target.closest('#share-copy');
    if (copyShare) {
      const url = $('share-url').value;
      navigator.clipboard?.writeText(url).then(() => toast(t('share.copied')));
    }
  });

  // ---------- AI analysis (TODO 16) ----------
  const AI = {
    consentKey: 'netutils-ai-consent',
    hasConsent() { return localStorage.getItem(this.consentKey) === 'yes'; },
    async run(btn, tool, payload, container) {
      if (!this.hasConsent()) {
        if (!confirm(t('ai.consent'))) return;
        localStorage.setItem(this.consentKey, 'yes');
      }
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader"></i> ' + t('ai.working');
      const panel = document.createElement('div');
      panel.className = 'ai-panel';
      panel.innerHTML = `<div class="ai-panel-head"><strong>${esc(t('ai.title'))}</strong><button type="button" class="copy-btn" data-copy="">Copy</button></div><div class="ai-content"><span class="ai-cursor">▍</span></div>`;
      container.appendChild(panel);
      const content = panel.querySelector('.ai-content');
      const copyBtn = panel.querySelector('[data-copy]');
      let full = '';
      try {
        const res = await fetch(`/api/ai?tool=${tool}&stream=1&data=${encodeURIComponent(JSON.stringify(payload))}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const j = JSON.parse(line.slice(5).trim());
            if (j.token) { full += j.token; content.innerHTML = miniMarkdown(full); content.scrollTop = content.scrollHeight; }
            if (j.done) { copyBtn.dataset.copy = full; }
          }
        }
        if (!full) content.textContent = t('ai.empty');
      } catch (err) {
        content.textContent = err.message;
        copyBtn.style.display = 'none';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="sparkles"></i> ' + t('action.ai');
        if (window.lucide) lucide.createIcons();
      }
    }
  };

  function miniMarkdown(text) {
    return esc(text)
      .replace(/^### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^## (.*)$/gm, '<h4>$1</h4>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\n)- (.+)/g, '$1<span class="md-li">• $2</span>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ---------- tabs ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      $(tab.dataset.target)?.classList.add('active');
    });
  });

  // ---------- IP Info ----------
  async function runIp(query) {
    const q = query ?? $('ip-input').value.trim();
    if (!q) { showError('ip-error', t('err.required')); return; }
    hide('ip-error'); hide('ip-result'); setLoading('ip-loading', true);
    try {
      const d = await apiCall(`/api/ip${q ? '?data=' + encodeURIComponent(q) : ''}`);
      hide('ip-loading');
      const items = [
        { label: t('ip.ip'), value: d.ip, mono: true, copy: true },
        { label: t('ip.country'), value: d.country },
        { label: t('ip.region'), value: d.region },
        { label: t('ip.city'), value: d.city },
        { label: t('ip.isp'), value: d.isp },
        { label: t('ip.org'), value: d.organization },
        { label: 'ASN', value: d.asn, mono: true },
        { label: t('ip.tz'), value: d.timezone },
        { label: t('ip.coord'), value: d.latitude != null ? `${d.latitude}, ${d.longitude}` : 'N/A', mono: true },
        { label: t('ip.rdns'), value: d.reverseDns || 'N/A', mono: true },
        { label: t('ip.mobile'), value: d.mobile ? t('yes') : t('no') },
        { label: t('ip.proxy'), value: d.proxy ? t('yes') : t('no') },
        { label: t('ip.hosting'), value: d.hosting ? t('yes') : t('no') },
        { label: t('ip.provider'), value: d.meta?.provider, mono: true },
        { label: t('ip.cached'), value: d.meta?.cached ? t('yes') : t('no') },
        { label: t('ip.elapsed'), value: d.meta?.elapsedMs ? `${d.meta.elapsedMs} ms` : 'N/A', mono: true }
      ];
      const container = $('ip-result');
      dataGrid($('ip-data'), items);
      actionBar(container, { tool: 'ip', query: q, result: d, aiPayload: d });
      const plot = document.createElement('button');
      plot.type = 'button';
      plot.className = 'button button-secondary';
      plot.innerHTML = '<i data-lucide="map"></i> ' + t('action.plot');
      plot.addEventListener('click', () => {
        if (d.latitude != null) { MapModule.addMarker({ ip: d.ip, label: d.city || d.ip, latitude: d.latitude, longitude: d.longitude }); document.querySelector('[data-target="card-map"]').click(); }
      });
      container.querySelector('.result-actions').appendChild(plot);
      if (window.lucide) lucide.createIcons();
      show('ip-result');
      History.add({ tool: 'ip', query: q, status: 'ok', result: d });
    } catch (err) { hide('ip-loading'); showError('ip-error', err.message); History.add({ tool: 'ip', query: q, status: 'error', result: { error: err.message } }); }
  }

  // ---------- DNS ----------
  async function runDns(query) {
    const q = query ?? $('dns-input').value.trim();
    const type = $('dns-type').value;
    if (!q) { showError('dns-error', t('err.required')); return; }
    hide('dns-error'); hide('dns-result'); setLoading('dns-loading', true);
    try {
      const d = await apiCall(`/api/dns?data=${encodeURIComponent(q)}&type=${type}`);
      hide('dns-loading');
      $('dns-domain').textContent = d.domain;
      const dnssecEl = $('dns-dnssec');
      dnssecEl.className = 'badge';
      dnssecEl.textContent = t(`dnssec.${d.dnssec.status || 'unknown'}`);
      dnssecEl.classList.add(d.dnssec.status === 'validated' || d.dnssec.status === 'secure' ? 'badge-success' : d.dnssec.status === 'bogus' ? 'badge-error' : '');

      const flags = [];
      if (d.flags?.homograph) flags.push('<span class="chip chip-error">' + esc(t('dns.homograph')) + '</span>');
      if (d.flags?.punycode) flags.push('<span class="chip">IDN / punycode</span>');
      $('dns-flags').innerHTML = flags.join(' ');

      const container = $('dns-records');
      container.innerHTML = '';
      const typeLabels = { A: 'A (IPv4)', AAAA: 'AAAA (IPv6)', MX: 'MX', TXT: 'TXT', NS: 'NS', CNAME: 'CNAME', SOA: 'SOA', SRV: 'SRV' };
      let has = false;
      for (const [typeName, records] of Object.entries(d.records || {})) {
        if (!records || (Array.isArray(records) && records.length === 0)) continue;
        has = true;
        let html = `<div class="dns-section"><h3>${typeLabels[typeName] || typeName} ${esc(t('dns.records'))}</h3><div class="dns-records">`;
        const recs = Array.isArray(records) ? records : [records];
        for (const r of recs) {
          if (typeName === 'MX') html += `<div class="dns-record"><span class="record-type record-${typeName}">MX</span>${esc(r.exchange)} (priority ${r.priority}, TTL ${r.ttl ?? '?'})</div>`;
          else if (typeName === 'SOA') html += `<div class="dns-record"><span class="record-type record-SOA">SOA</span>${esc(r.nsname)} · ${esc(r.hostmaster)} · serial ${r.serial}</div>`;
          else if (typeName === 'SRV') html += `<div class="dns-record"><span class="record-type record-SRV">SRV</span>${esc(r.name)}:${r.port} (prio ${r.priority}, weight ${r.weight})</div>`;
          else html += `<div class="dns-record"><span class="record-type record-${typeName}">${typeName}</span>${esc(r.value ?? r.exchange ?? r.nsname ?? JSON.stringify(r))}${r.ttl ? ` <span class="ttl">TTL ${r.ttl}</span>` : ''}</div>`;
        }
        html += '</div></div>';
        container.insertAdjacentHTML('beforeend', html);
      }
      if (!has) container.innerHTML = `<p class="empty">${esc(t('dns.none'))}</p>`;

      const diff = $('dns-diff');
      diff.innerHTML = '';
      if (d.resolverDiff && d.resolverDiff.length) {
        diff.innerHTML = `<h3 class="result-subtitle">⚠️ ${esc(t('dns.diffTitle'))}</h3>`;
        const table = document.createElement('div');
        table.className = 'diff-list';
        d.resolverDiff.slice(0, 12).forEach(x => {
          const row = document.createElement('div');
          row.className = 'diff-row';
          row.innerHTML = `<span class="record-type record-info">${esc(x.type)}</span><span class="mono">${esc(x.value)}</span><span class="diff-missing">${esc(t('dns.missingIn'))}: ${x.missingIn.join(', ')}</span>`;
          table.appendChild(row);
        });
        diff.appendChild(table);
      }

      const resolversEl = $('dns-resolvers');
      resolversEl.innerHTML = '';
      for (const [id, r] of Object.entries(d.resolvers || {})) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${id}${r.dnssec?.ad ? ' ✓AD' : ''}`;
        resolversEl.appendChild(chip);
      }

      actionBar($('dns-result'), { tool: 'dns', query: q, result: d, aiPayload: d });
      show('dns-result');
      History.add({ tool: 'dns', query: q, status: 'ok', result: d });
    } catch (err) { hide('dns-loading'); showError('dns-error', err.message); }
  }

  // ---------- Headers ----------
  async function runHeaders(query) {
    const q = query ?? $('headers-input').value.trim();
    if (!q) { showError('headers-error', t('err.required')); return; }
    hide('headers-error'); hide('headers-result'); setLoading('headers-loading', true);
    try {
      const d = await apiCall(`/api/headers?data=${encodeURIComponent(q)}`);
      hide('headers-loading');
      const score = $('headers-score');
      score.className = `score-badge score-${d.securityScore >= 80 ? 'good' : d.securityScore >= 50 ? 'mid' : 'bad'}`;
      score.textContent = `${t('headers.score')}: ${d.securityScore}/100`;
      score.title = (d.securityChecks || []).filter(c => !c.ok).map(c => c.why).join('\n');
      dataGrid($('headers-general'), [
        { label: 'URL', value: d.url, mono: true, copy: true },
        { label: t('headers.final'), value: d.finalUrl, mono: true },
        { label: t('headers.status'), value: `${d.statusCode} ${d.statusMessage || ''}`, mono: true },
        { label: t('headers.version'), value: d.httpVersion, mono: true },
        { label: t('headers.redirects'), value: d.redirectCount, mono: true },
        { label: t('headers.duration'), value: d.durationMs ? `${d.durationMs} ms` : 'N/A', mono: true }
      ]);
      const tbody = $('headers-table-body');
      tbody.innerHTML = '';
      for (const [key, value] of Object.entries(d.headers)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(key)}</td><td class="mono">${esc(Array.isArray(value) ? value.join(', ') : String(value))}</td>`;
        tbody.appendChild(tr);
      }
      actionBar($('headers-result'), { tool: 'headers', query: q, result: d, aiPayload: d });
      show('headers-result');
      History.add({ tool: 'headers', query: q, status: 'ok', result: d });
    } catch (err) { hide('headers-loading'); showError('headers-error', err.message); }
  }

  // ---------- Port Scan (SSE) ----------
  let scanEs = null;
  async function runPortscan(query) {
    const q = query ?? $('portscan-input').value.trim();
    const ports = $('portscan-ports').value.trim();
    if (!q) { showError('portscan-error', t('err.required')); return; }
    hide('portscan-error'); hide('portscan-result'); setLoading('portscan-loading', true);
    show('portscan-progress-wrap');
    setProgress(0, 0, null);
    $('portscan-list').innerHTML = '';
    $('portscan-summary').innerHTML = '';
    const cancel = $('portscan-cancel');
    cancel.style.display = 'inline-flex';

    const url = `/api/portscan?data=${encodeURIComponent(q)}${ports ? '&ports=' + encodeURIComponent(ports) : ''}&stream=1`;
    scanEs = new EventSource(url);
    const doneHandler = (evt) => {
      const data = JSON.parse(evt.data);
      renderPortscanResults(data.scanId, data.host, data.summary, data.durationMs);
      setProgress(data.summary?.open + data.summary?.filtered + data.summary?.closed || 0, data.totalScanned ?? ports.split(',').length, data.durationMs);
    };
    scanEs.addEventListener('start', e => {
      const d = JSON.parse(e.data);
      setProgress(0, d.total, null);
    });
    scanEs.addEventListener('result', e => {
      const r = JSON.parse(e.data);
      appendPortResult(r);
    });
    scanEs.addEventListener('progress', e => {
      const d = JSON.parse(e.data);
      setProgress(d.done, d.total, d.elapsedMs);
    });
    scanEs.addEventListener('done', e => {
      doneHandler(e);
      scanEs?.close();
      scanEs = null;
      setLoading('portscan-loading', false);
      cancel.style.display = 'none';
      show('portscan-result');
    });
    scanEs.addEventListener('error', () => {
      // EventSource auto-retries; after close, finalize
      scanEs?.close();
      scanEs = null;
      setLoading('portscan-loading', false);
      cancel.style.display = 'none';
      showError('portscan-error', t('portscan.streamErr'));
    });
  }

  function setProgress(done, total, elapsedMs) {
    const bar = $('portscan-progress');
    if (!bar || !total) return;
    bar.style.width = `${Math.min(100, (done / total) * 100)}%`;
    $('portscan-progress-label').textContent = `${done}/${total}${elapsedMs ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : ''}`;
  }

  function appendPortResult(r) {
    const div = document.createElement('div');
    div.className = `port-item ${r.status}`;
    div.innerHTML = `<div class="port-num">${r.port}</div><div class="port-status">${r.status}</div><div class="port-service">${esc(r.service)}${r.banner ? `<div class="port-banner mono">${esc(r.banner.slice(0, 60))}</div>` : ''}</div>`;
    $('portscan-list').appendChild(div);
  }

  function renderPortscanResults(scanId, host, summary, durationMs) {
    $('portscan-summary').innerHTML = [
      ['Host', esc(host), true],
      [t('portscan.scanId'), scanId, true],
      [t('portscan.open'), summary?.open ?? 0, false],
      [t('portscan.filtered'), summary?.filtered ?? 0, false],
      [t('portscan.closed'), summary?.closed ?? 0, false],
      [t('portscan.duration'), durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '—', false]
    ].map(([label, value, mono]) => `<div class="data-item"><div class="label">${label}</div><div class="value${mono ? ' mono' : ''}">${value}</div></div>`).join('');
  }

  // ---------- SSL ----------
  async function runSsl(query) {
    const q = query ?? $('ssl-input').value.trim();
    const port = $('ssl-port').value || '443';
    if (!q) { showError('ssl-error', t('err.required')); return; }
    hide('ssl-error'); hide('ssl-result'); setLoading('ssl-loading', true);
    try {
      const d = await apiCall(`/api/ssl?data=${encodeURIComponent(q)}&port=${port}`);
      hide('ssl-loading');
      renderSslScore(d.score, d.grade);
      const cert = d.certificate || {};
      dataGrid($('ssl-data'), [
        { label: t('ssl.domain'), value: d.host, mono: true },
        { label: t('ssl.port'), value: d.port, mono: true },
        { label: t('ssl.protocol'), value: d.protocol, mono: true },
        { label: t('ssl.cipher'), value: d.cipher ? `${d.cipher.name} (${d.cipher.version})` : 'N/A', mono: true },
        { label: t('ssl.issuer'), value: cert.issuer?.O || cert.issuer?.CN || 'N/A' },
        { label: t('ssl.subject'), value: cert.subject?.CN || 'N/A' },
        { label: t('ssl.validFrom'), value: cert.validFrom || 'N/A' },
        { label: t('ssl.validTo'), value: cert.validTo || 'N/A' },
        { label: t('ssl.daysLeft'), value: cert.daysRemaining != null ? `${cert.daysRemaining} ${t('ssl.days')}` : 'N/A' },
        { label: t('ssl.keySize'), value: cert.keySize ? `${cert.keySize} bit` : 'N/A' },
        { label: t('ssl.sigAlg'), value: cert.sigAlg || 'N/A', mono: true },
        { label: t('ssl.fingerprint'), value: cert.fingerprint || 'N/A', mono: true, copy: true },
        { label: t('ssl.ocsp'), value: t(`ocsp.${d.ocsp?.status || 'unavailable'}`) }
      ]);
      $('ssl-san').innerHTML = (cert.san || []).map(s => `<span class="chip">${esc(s)}</span>`).join(' ') || '<span class="chip">—</span>';

      $('ssl-chain').innerHTML = '';
      (d.chain || []).forEach((c, i) => {
        const div = document.createElement('div');
        div.className = `chain-item ${c.isCA ? 'chain-ca' : ''}`;
        div.innerHTML = `<div class="chain-depth">#${i}</div><div class="chain-body"><strong>${esc(c.subject?.CN || c.subject?.O || 'unknown')}</strong><div class="label">${esc(c.issuer?.CN || '')}</div><div class="label">${esc(c.validFrom || '')} → ${esc(c.validTo || '')}</div></div><div class="chain-verified">${c.isCA ? esc(t('ssl.ca')) : c.isExpired ? esc(t('ssl.expired')) : '✓'}</div>`;
        $('ssl-chain').appendChild(div);
      });

      $('ssl-tlsmatrix').innerHTML = '';
      const v = d.tlsVersions?.supported || {};
      ['1.0', '1.1', '1.2', '1.3'].forEach(ver => {
        const ok = v[ver];
        const chip = document.createElement('span');
        chip.className = `chip ${ok ? 'chip-good' : 'chip-error'}`;
        chip.textContent = `TLS ${ver}: ${ok ? '✓' : '✗'}`;
        $('ssl-tlsmatrix').appendChild(chip);
      });

      $('ssl-ciphers').innerHTML = '';
      (d.ciphers || []).forEach(c => {
        const chip = document.createElement('span');
        chip.className = `chip ${c.weak ? 'chip-error' : 'chip-good'}`;
        chip.textContent = c.name;
        $('ssl-ciphers').appendChild(chip);
      });

      $('ssl-breakdown').innerHTML = (d.scoreBreakdown || []).map(b => `<div class="diff-row">${esc(b)}</div>`).join('') || '';
      actionBar($('ssl-result'), { tool: 'ssl', query: q, result: d, aiPayload: d });
      show('ssl-result');
      History.add({ tool: 'ssl', query: q, status: 'ok', result: d });
    } catch (err) { hide('ssl-loading'); showError('ssl-error', err.message); }
  }

  function renderSslScore(score, grade) {
    const canvas = $('ssl-gauge');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 120;
    canvas.width = size * dpr; canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, r = 48;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const pct = Math.max(0, Math.min(100, score)) / 100;
    const color = score >= 80 ? '#1e7b4b' : score >= 50 ? '#b45309' : '#d92d20';
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-on-surface');
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(score), cx, cy - 6);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'var(--color-secondary)';
    ctx.fillText(`Grade ${grade || '—'}`, cx, cy + 18);
  }

  // ---------- WHOIS ----------
  async function runWhois(query) {
    const q = query ?? $('whois-input').value.trim();
    if (!q) { showError('whois-error', t('err.required')); return; }
    hide('whois-error'); hide('whois-result'); setLoading('whois-loading', true);
    try {
      const d = await apiCall(`/api/whois?data=${encodeURIComponent(q)}`);
      hide('whois-loading');
      const items = [
        { label: t('whois.target'), value: d.target, mono: true, copy: true },
        { label: t('whois.kind'), value: d.kind },
        { label: t('whois.source'), value: d.source, mono: true },
        { label: t('whois.registrar'), value: d.registrar || 'N/A' },
        { label: t('whois.created'), value: d.creationDate || 'N/A', mono: true },
        { label: t('whois.expiry'), value: d.expiryDate || 'N/A', mono: true },
        { label: t('whois.updated'), value: d.updatedDate || 'N/A', mono: true },
        { label: t('whois.abuse'), value: d.abuseEmail || 'N/A', mono: true, copy: !!d.abuseEmail },
        { label: t('whois.dnssec'), value: d.dnssec ? t('yes') : t('no') }
      ];
      if (d.meta?.range) items.push({ label: t('whois.range'), value: d.meta.range, mono: true });
      if (d.meta?.name) items.push({ label: t('whois.name'), value: d.meta.name });
      dataGrid($('whois-data'), items);
      const nsEl = $('whois-ns');
      nsEl.innerHTML = (d.nameservers || []).map(n => `<span class="chip mono">${esc(n)}</span>`).join(' ') || '<span class="chip">—</span>';
      const stEl = $('whois-status');
      stEl.innerHTML = (d.status || []).map(s => `<span class="chip">${esc(s)}</span>`).join(' ') || '<span class="chip">—</span>';
      const rgEl = $('whois-registrant');
      rgEl.innerHTML = d.registrant ? `<div class="dns-record mono">${esc(d.registrant.name || '')}${d.registrant.org ? ' · ' + esc(d.registrant.org) : ''}${d.registrant.email ? ' · ' + esc(d.registrant.email) : ''}</div>` : '<span class="chip">—</span>';
      if (d.raw) {
        $('whois-raw').textContent = d.raw;
        show('whois-raw-wrap');
      } else hide('whois-raw-wrap');
      actionBar($('whois-result'), { tool: 'whois', query: q, result: d, aiPayload: d });
      show('whois-result');
      History.add({ tool: 'whois', query: q, status: 'ok', result: d });
    } catch (err) { hide('whois-loading'); showError('whois-error', err.message); }
  }

  // ---------- CT ----------
  async function runCt(query) {
    const q = query ?? $('ct-input').value.trim();
    if (!q) { showError('ct-error', t('err.required')); return; }
    hide('ct-error'); hide('ct-result'); setLoading('ct-loading', true);
    try {
      const d = await apiCall(`/api/ct?data=${encodeURIComponent(q)}`);
      hide('ct-loading');
      $('ct-stats').innerHTML = [
        [t('ct.domain'), esc(d.domain), true],
        [t('ct.total'), d.totalCertificates, false],
        [t('ct.unique'), d.subdomains.length, false],
        [t('ct.wildcards'), d.subdomains.filter(s => s.wildcard).length, false],
        [t('ct.source'), d.source, true]
      ].map(([label, value, mono]) => `<div class="data-item"><div class="label">${label}</div><div class="value${mono ? ' mono' : ''}">${value}</div></div>`).join('');
      drawCtTimeline(d.timeline);
      window.__ctData = d.subdomains;
      const list = $('ct-list');
      list.innerHTML = '';
      d.subdomains.slice(0, 200).forEach(s => {
        const row = document.createElement('div');
        row.className = 'ct-row';
        row.innerHTML = `<span class="mono">${esc(s.name)}</span>${s.wildcard ? '<span class="chip chip-wild">*</span>' : ''}<span class="label">${esc((s.issuers[0] || '').slice(0, 40))}</span><span class="label mono">${esc((s.firstSeen || '').slice(0, 10))}</span>`;
        row.addEventListener('click', () => { $('ip-input').value = s.name; document.querySelector('[data-target="card-ip"]').click(); runIp(s.name); });
        list.appendChild(row);
      });
      actionBar($('ct-result'), { tool: 'ct', query: q, result: d, aiPayload: d });
      show('ct-result');
      History.add({ tool: 'ct', query: q, status: 'ok', result: d });
    } catch (err) { hide('ct-loading'); showError('ct-error', err.message); }
  }

  function drawCtTimeline(timeline) {
    const canvas = $('ct-timeline');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = 140;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!timeline.length) return;
    const max = Math.max(...timeline.map(x => x.count), 1);
    const bw = (w - 40) / timeline.length;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'var(--color-secondary)';
    timeline.forEach((x, i) => {
      const bh = (x.count / max) * (h - 40);
      ctx.fillStyle = '#635BFF';
      ctx.fillRect(20 + i * bw + 4, h - 22 - bh, bw - 8, bh);
      ctx.fillStyle = 'var(--color-secondary)';
      if (timeline.length <= 14) ctx.fillText(x.month.slice(5), 20 + i * bw + 4, h - 8);
    });
  }

  // ---------- Batch ----------
  let batchEs = null;
  async function runBatch() {
    const raw = $('batch-input').value.trim();
    const tool = $('batch-tool').value;
    if (!raw) { showError('batch-error', t('err.required')); return; }
    const items = [...new Set(raw.split(/\n|,|;/).map(s => s.trim().toLowerCase()).filter(Boolean))];
    hide('batch-error'); hide('batch-result'); setLoading('batch-loading', true);
    $('batch-progress-bar').style.width = '0%';
    $('batch-table-body').innerHTML = '';
    const webhookUrl = $('batch-webhook').value.trim() || undefined;
    const webhookSecret = $('batch-secret').value.trim() || undefined;
    try {
      const created = await apiCall('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, items, webhookUrl, webhookSecret })
      });
      const jobId = created.jobId;
      batchEs = new EventSource(`/api/scan?jobId=${jobId}&stream=1`);
      batchEs.addEventListener('item', e => {
        const d = JSON.parse(e.data);
        addBatchRow(d.item, d.status);
        const done = parseInt($('batch-table-body').children.length, 10);
        $('batch-progress-bar').style.width = `${Math.min(100, (done / created.total) * 100)}%`;
        $('batch-progress-label').textContent = `${done}/${created.total}`;
      });
      batchEs.addEventListener('done', e => {
        const d = JSON.parse(e.data);
        batchEs?.close(); batchEs = null;
        setLoading('batch-loading', false);
        $('batch-progress-bar').style.width = '100%';
        $('batch-progress-label').textContent = `${d.ok} ${t('batch.ok')} · ${d.failed} ${t('batch.fail')}`;
        $('batch-download').style.display = 'inline-flex';
        window.__batchResult = d;
        show('batch-result');
        toast(`${t('batch.done')}: ${d.ok} ok, ${d.failed} failed`);
      });
      batchEs.addEventListener('error', () => { batchEs?.close(); batchEs = null; setLoading('batch-loading', false); showError('batch-error', t('batch.streamErr')); });
      show('batch-result');
    } catch (err) { setLoading('batch-loading', false); showError('batch-error', err.message); }
  }

  function addBatchRow(item, status) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${esc(item)}</td><td><span class="chip ${status === 'ok' ? 'chip-success' : status === 'error' ? 'chip-error' : ''}">${status}</span></td>`;
    $('batch-table-body').appendChild(tr);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#batch-export-csv')) {
      const d = window.__batchResult;
      if (!d) return;
      const rows = [['item', 'status', 'result']];
      d.results.forEach(r => rows.push([r.item, r.status, JSON.stringify(r.result || r.error || '')]));
      downloadFile('batch.csv', '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
    }
    if (e.target.closest('#batch-export-json')) {
      const d = window.__batchResult;
      if (!d) return;
      downloadFile('batch.json', JSON.stringify(d, null, 2), 'application/json');
    }
    if (e.target.closest('#ct-export')) {
      const rows = [['name', 'wildcard', 'first_seen', 'last_seen', 'issuers']];
      (window.__ctData || []).forEach(s => rows.push([s.name, s.wildcard, s.firstSeen, s.lastSeen, s.issuers.join('|')]));
      downloadFile('ct-subdomains.csv', '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
    }
  });

  // ---------- Map (TODO 15) ----------
  const MapModule = {
    markers: [],
    instance: null,
    init() {
      const canvas = $('map-canvas');
      if (!canvas || this.instance) return;
      this.instance = GeoMap.create(canvas, {
        onMarkerHover: (m) => { $('map-tooltip').textContent = `${m.ip} · ${m.label || ''}`; }
      });
      GeoMap.loadWorldBorders().then(polys => { if (polys) this.instance.setBorders(polys); });
    },
    addMarker(m) {
      this.markers = this.markers.filter(x => x.ip !== m.ip);
      this.markers.push(m);
      if (this.instance) this.instance.setMarkers(this.markers);
    },
    plotHistory() {
      const store = History.list('ip') || [];
      let n = 0;
      store.forEach(h => {
        let r;
        try { r = JSON.parse('{' + (h.resultPreview || '').replace(/^\{/, '').replace(/…\s*$/, '') + '}'); } catch { r = {}; }
        if (r.latitude != null) { this.addMarker({ ip: r.ip || h.query, label: r.city || h.query, latitude: r.latitude, longitude: r.longitude }); n++; }
      });
      toast(n ? `${n} ${t('map.plotted')}` : t('map.empty'));
    },
    clear() {
      this.markers = [];
      if (this.instance) this.instance.setMarkers([]);
    }
  };

  // ---------- History UI (TODO 10) ----------
  function renderRecent(tool, targetId) {
    const el = $(targetId);
    if (!el) return;
    const entries = History.recent(tool, 5);
    el.innerHTML = '';
    if (entries.length === 0) return;
    const title = document.createElement('div');
    title.className = 'recent-title';
    title.textContent = t('history.recent');
    el.appendChild(title);
    entries.forEach(h => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip recent-chip';
      chip.textContent = h.query;
      chip.title = h.resultPreview || '';
      chip.addEventListener('click', () => {
        const actions = { ip: runIp, dns: runDns, headers: runHeaders, portscan: runPortscan, ssl: runSsl, whois: runWhois, ct: runCt };
        actions[h.type]?.(h.query);
      });
      el.appendChild(chip);
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'chip recent-clear';
    clear.textContent = t('history.clear');
    clear.addEventListener('click', () => { History.remove(tool, entries[0].timestamp); renderRecent(tool, targetId); });
    el.appendChild(clear);
  }

  document.addEventListener('historychange', () => {
    ['ip', 'dns', 'headers', 'portscan', 'ssl', 'whois', 'ct'].forEach((tool, i) => renderRecent(tool, ['ip-recent', 'dns-recent', 'headers-recent', 'portscan-recent', 'ssl-recent', 'whois-recent', 'ct-recent'][i]));
  });

  document.addEventListener('click', e => {
    const clearAll = e.target.closest('#history-clear');
    if (clearAll && confirm(t('history.confirmClear'))) { History.clearAll(); toast(t('history.cleared')); }
    const toggle = e.target.closest('#history-toggle');
    if (toggle) {
      const next = !History.enabled();
      History.setEnabled(next);
      toggle.classList.toggle('active', next);
      toggle.querySelector('span').textContent = next ? t('history.on') : t('history.off');
    }
  });

  // ---------- command palette registration (TODO 14) ----------
  function registerPalette() {
    const run = (id) => document.querySelector(`[data-target="${id}"]`)?.click();
    Palette.register('switch-ip', { title: 'IP Info', keywords: 'ip lookup', run: () => run('card-ip') });
    Palette.register('switch-dns', { title: 'DNS Lookup', keywords: 'dns records', run: () => run('card-dns') });
    Palette.register('switch-headers', { title: 'HTTP Headers', keywords: 'headers http', run: () => run('card-headers') });
    Palette.register('switch-portscan', { title: 'Port Scan', keywords: 'portscan ports', run: () => run('card-portscan') });
    Palette.register('switch-ssl', { title: 'SSL Check', keywords: 'ssl tls cert', run: () => run('card-ssl') });
    Palette.register('switch-whois', { title: 'WHOIS Lookup', keywords: 'whois rdap domain', run: () => run('card-whois') });
    Palette.register('switch-ct', { title: 'Certificate Transparency', keywords: 'ct subdomains cert', run: () => run('card-ct') });
    Palette.register('switch-batch', { title: 'Batch Scan', keywords: 'batch bulk job', run: () => run('card-batch') });
    Palette.register('switch-map', { title: 'Geo Map', keywords: 'map plot location', run: () => run('card-map') });
    Palette.register('theme-cycle', { title: 'Cycle Theme', keywords: 'dark light theme', hint: '⇧ Theme', run: () => { Theme.cycle(); toast(`Theme: ${Theme.mode()}`); } });
    Palette.register('copy-ip', {
      title: 'Copy my IP', keywords: 'ip copy',
      run: async () => {
        try {
          const d = await apiCall('/api/ip');
          navigator.clipboard?.writeText(d.ip).then(() => toast(`IP: ${d.ip}`));
        } catch { toast('Failed'); }
      }
    });
    Palette.register('open-docs', { title: 'Open API Docs', keywords: 'docs api', run: () => { location.href = '/docs'; } });
    Palette.register('preset-scan-web', { title: 'Preset: scan web ports', keywords: 'preset ports', run: () => { run('card-portscan'); $('portscan-input').value = 'example.com'; $('portscan-ports').value = '80,443,8080'; runPortscan('example.com'); } });
  }

  function showError(id, message) {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.add('active');
  }

  // ---------- wire up ----------
  function wire() {
    $('ip-lookup-btn').addEventListener('click', () => runIp());
    $('dns-lookup-btn').addEventListener('click', () => runDns());
    $('headers-lookup-btn').addEventListener('click', () => runHeaders());
    $('portscan-btn').addEventListener('click', () => runPortscan());
    $('ssl-check-btn').addEventListener('click', () => runSsl());
    $('whois-lookup-btn').addEventListener('click', () => runWhois());
    $('ct-lookup-btn').addEventListener('click', () => runCt());
    $('batch-run-btn').addEventListener('click', runBatch);
    $('batch-cancel').addEventListener('click', () => { batchEs?.close(); batchEs = null; setLoading('batch-loading', false); });
    $('portscan-cancel').addEventListener('click', () => { scanEs?.close(); scanEs = null; setLoading('portscan-loading', false); $('portscan-cancel').style.display = 'none'; });
    ['ip', 'dns', 'headers', 'portscan', 'ssl', 'whois', 'ct'].forEach(tool => {
      const input = $(`${tool}-input`);
      if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { const btns = { ip: 'ip-lookup-btn', dns: 'dns-lookup-btn', headers: 'headers-lookup-btn', portscan: 'portscan-btn', ssl: 'ssl-check-btn', whois: 'whois-lookup-btn', ct: 'ct-lookup-btn' }; $(btns[tool])?.click(); } });
    });
    const themeBtn = $('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', () => { const m = Theme.cycle(); toast(`${t('theme.mode')}: ${m}`); });
    const langSel = $('lang-select');
    if (langSel) langSel.addEventListener('change', () => I18n.set(langSel.value));
    const paletteBtn = $('palette-trigger');
    if (paletteBtn) paletteBtn.addEventListener('click', () => Palette.open());
    $('map-plot-history').addEventListener('click', () => MapModule.plotHistory());
    $('map-clear').addEventListener('click', () => MapModule.clear());
    const histToggle = $('history-toggle');
    if (histToggle) { histToggle.classList.toggle('active', History.enabled()); histToggle.querySelector('span').textContent = History.enabled() ? t('history.on') : t('history.off'); }
    registerPalette();
    MapModule.init();
  }

  // ---------- share deep link (mode A client-side) ----------
  async function handleShareHash() {
    const m = location.hash.match(/^#\/share\/(.+)$/);
    if (!m) return;
    const payload = await share.resolveLocal(m[1]);
    if (!payload || !payload.tool) return;
    toast(`Shared result: ${payload.tool} · ${payload.query}`);
    const tab = { ip: 'card-ip', dns: 'card-dns', headers: 'card-headers', portscan: 'card-portscan', ssl: 'card-ssl', whois: 'card-whois', ct: 'card-ct' }[payload.tool];
    if (tab) document.querySelector(`[data-target="${tab}"]`)?.click();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    await handleShareHash();
    try {
      const d = await apiCall('/api/ip');
      const items = [
        { label: t('ip.ip'), value: d.ip, mono: true, copy: true },
        { label: t('ip.country'), value: d.country },
        { label: t('ip.city'), value: d.city },
        { label: t('ip.isp'), value: d.isp },
        { label: t('ip.asn'), value: d.asn, mono: true },
        { label: t('ip.proxy'), value: d.proxy ? t('yes') : t('no') }
      ];
      dataGrid($('ip-data'), items);
      show('ip-result');
      if (window.lucide) lucide.createIcons();
    } catch { /* auto-detect best effort */ }
  });

  window.NetUtils = { runIp, runDns, runHeaders, runPortscan, runSsl, runWhois, runCt, MapModule };
})();

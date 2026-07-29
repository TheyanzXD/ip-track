const features = {
  ip: { tab: 'tab-ip', card: 'card-ip', endpoint: '/api/ip' },
  dns: { tab: 'tab-dns', card: 'card-dns', endpoint: '/api/dns' },
  headers: { tab: 'tab-headers', card: 'card-headers', endpoint: '/api/headers' },
  portscan: { tab: 'tab-portscan', card: 'card-portscan', endpoint: '/api/portscan' },
  ssl: { tab: 'tab-ssl', card: 'card-ssl', endpoint: '/api/ssl' }
};

function $(id) { return document.getElementById(id); }

function showError(id, message) {
  const el = $(id);
  if (el) { el.textContent = message; el.classList.add('active'); }
}
function hideError(id) { const el = $(id); if (el) el.classList.remove('active'); }
function showLoading(id) { const el = $(id); if (el) el.classList.add('active'); }
function hideLoading(id) { const el = $(id); if (el) el.classList.remove('active'); }
function showResult(id) { const el = $(id); if (el) el.classList.add('active'); }
function hideResult(id) { const el = $(id); if (el) el.classList.remove('active'); }

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    $(this.dataset.target).classList.add('active');
  });
});

// --- IP Info ---
async function fetchMyIp() {
  hideError('ip-error'); hideResult('ip-result'); showLoading('ip-loading');
  try {
    const res = await fetch('/api/ip');
    const data = await res.json();
    hideLoading('ip-loading');
    if (data.status === 'success') renderIpData(data.data);
    else showError('ip-error', data.message);
  } catch (err) {
    hideLoading('ip-loading');
    showError('ip-error', 'Connection error. Please try again.');
  }
}

$('ip-lookup-btn').addEventListener('click', async function () {
  const ip = $('ip-input').value.trim();
  if (!ip) { showError('ip-error', 'Please enter an IP address or domain'); return; }
  hideError('ip-error'); hideResult('ip-result'); showLoading('ip-loading');
  try {
    const res = await fetch(`/api/ip?data=${encodeURIComponent(ip)}`);
    const data = await res.json();
    hideLoading('ip-loading');
    if (data.status === 'success') renderIpData(data.data);
    else showError('ip-error', data.message);
  } catch (err) { hideLoading('ip-loading'); showError('ip-error', 'Connection error.'); }
});

function renderIpData(d) {
  const grid = $('ip-data');
  grid.innerHTML = '';
  [
    { label: 'IP Address', value: d.ip, mono: true },
    { label: 'Country', value: d.country },
    { label: 'Region', value: d.region },
    { label: 'City', value: d.city },
    { label: 'ISP', value: d.isp },
    { label: 'Organization', value: d.organization },
    { label: 'ASN', value: d.asn, mono: true },
    { label: 'Timezone', value: d.timezone },
    { label: 'Coordinates', value: d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : 'N/A', mono: true },
    { label: 'Mobile', value: d.mobile ? 'Yes' : 'No' },
    { label: 'Proxy/VPN', value: d.proxy ? 'Yes' : 'No' },
    { label: 'Hosting', value: d.hosting ? 'Yes' : 'No' }
  ].forEach(item => {
    const div = document.createElement('div');
    div.className = 'data-item';
    div.innerHTML = `<div class="label">${item.label}</div><div class="value${item.mono ? ' mono' : ''}">${item.value || 'N/A'}</div>`;
    grid.appendChild(div);
  });
  showResult('ip-result');
}

// --- DNS Lookup ---
$('dns-lookup-btn').addEventListener('click', async function () {
  const domain = $('dns-input').value.trim();
  const type = $('dns-type').value;
  if (!domain) { showError('dns-error', 'Please enter a domain name'); return; }
  hideError('dns-error'); hideResult('dns-result'); showLoading('dns-loading');
  try {
    const res = await fetch(`/api/dns?data=${encodeURIComponent(domain)}&type=${type}`);
    const data = await res.json();
    hideLoading('dns-loading');
    if (data.status === 'success') renderDnsData(data.data);
    else showError('dns-error', data.message);
  } catch (err) { hideLoading('dns-loading'); showError('dns-error', 'Connection error.'); }
});

function renderDnsData(d) {
  const container = $('dns-records');
  container.innerHTML = '';
  const typeLabels = { A: 'A (IPv4)', AAAA: 'AAAA (IPv6)', MX: 'MX (Mail Exchange)', TXT: 'TXT (Text)', NS: 'NS (Nameserver)', CNAME: 'CNAME (Canonical Name)', SOA: 'SOA (Start of Authority)', SRV: 'SRV (Service)' };
  let hasRecords = false;

  for (const [type, records] of Object.entries(d.records)) {
    if (!records || (Array.isArray(records) && records.length === 0)) continue;
    hasRecords = true;
    let html = `<div class="dns-section"><h3>${typeLabels[type] || type} Records</h3><div class="dns-records">`;
    if (type === 'MX') {
      records.sort((a, b) => a.priority - b.priority);
      records.forEach(r => { html += `<div class="dns-record"><span class="record-type record-${type}">${type}</span>${r.exchange} (priority: ${r.priority})</div>`; });
    } else if (type === 'SOA') {
      html += `<div class="dns-record"><span class="record-type record-${type}">SOA</span>nsname: ${records.nsname}<br>hostmaster: ${records.hostmaster}<br>serial: ${records.serial}</div>`;
    } else if (type === 'SRV') {
      records.forEach(r => { html += `<div class="dns-record"><span class="record-type record-${type}">SRV</span>${r.name}:${r.port} (priority: ${r.priority}, weight: ${r.weight})</div>`; });
    } else if (type === 'TXT') {
      records.forEach(entries => { html += `<div class="dns-record"><span class="record-type record-${type}">TXT</span>${Array.isArray(entries) ? entries.join(' ') : entries}</div>`; });
    } else {
      records.forEach(r => { html += `<div class="dns-record"><span class="record-type record-${type}">${type}</span>${r}</div>`; });
    }
    html += '</div></div>';
    container.insertAdjacentHTML('beforeend', html);
  }

  if (!hasRecords) container.innerHTML = '<p style="color:var(--text-secondary);padding:16px;text-align:center">No records found.</p>';
  $('dns-domain').textContent = d.domain;
  showResult('dns-result');
}
$('dns-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('dns-lookup-btn').click(); });

// --- HTTP Headers ---
$('headers-lookup-btn').addEventListener('click', async function () {
  const url = $('headers-input').value.trim();
  if (!url) { showError('headers-error', 'Please enter a URL'); return; }
  hideError('headers-error'); hideResult('headers-result'); showLoading('headers-loading');
  try {
    const res = await fetch(`/api/headers?data=${encodeURIComponent(url)}`);
    const data = await res.json();
    hideLoading('headers-loading');
    if (data.status === 'success') renderHeadersData(data.data);
    else showError('headers-error', data.message);
  } catch (err) { hideLoading('headers-loading'); showError('headers-error', 'Connection error.'); }
});

function renderHeadersData(d) {
  $('headers-general').innerHTML = `
    <div class="data-item"><div class="label">URL</div><div class="value mono">${d.url}</div></div>
    <div class="data-item"><div class="label">Final URL</div><div class="value mono">${d.finalUrl}</div></div>
    <div class="data-item"><div class="label">Status Code</div><div class="value mono">${d.statusCode} ${d.statusMessage}</div></div>
    <div class="data-item"><div class="label">HTTP Version</div><div class="value mono">${d.httpVersion}</div></div>
    <div class="data-item"><div class="label">Redirects</div><div class="value mono">${d.redirectCount}</div></div>`;
  const table = $('headers-table-body');
  table.innerHTML = '';
  for (const [key, value] of Object.entries(d.headers)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="font-weight:600;white-space:nowrap">${key}</td><td class="mono">${Array.isArray(value) ? value.join(', ') : value}</td>`;
    table.appendChild(tr);
  }
  showResult('headers-result');
}
$('headers-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('headers-lookup-btn').click(); });

// --- Port Scan ---
$('portscan-btn').addEventListener('click', async function () {
  const host = $('portscan-input').value.trim();
  const ports = $('portscan-ports').value.trim();
  if (!host) { showError('portscan-error', 'Please enter a hostname or IP address'); return; }
  hideError('portscan-error'); hideResult('portscan-result'); showLoading('portscan-loading');
  let url = `/api/portscan?data=${encodeURIComponent(host)}`;
  if (ports) url += `&ports=${encodeURIComponent(ports)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    hideLoading('portscan-loading');
    if (data.status === 'success') renderPortScan(data.data);
    else showError('portscan-error', data.message);
  } catch (err) { hideLoading('portscan-loading'); showError('portscan-error', 'Connection error.'); }
});

function renderPortScan(d) {
  $('portscan-summary').innerHTML = `
    <div class="data-item"><div class="label">Host</div><div class="value mono">${d.host}</div></div>
    <div class="data-item"><div class="label">Scanned</div><div class="value mono">${d.totalScanned} ports</div></div>
    <div class="data-item"><div class="label" style="color:var(--success)">Open</div><div class="value mono">${d.open}</div></div>
    <div class="data-item"><div class="label" style="color:var(--warning)">Filtered</div><div class="value mono">${d.filtered}</div></div>
    <div class="data-item"><div class="label" style="color:var(--text-secondary)">Closed</div><div class="value mono">${d.closed}</div></div>`;
  const container = $('portscan-list');
  container.innerHTML = '';
  d.results.forEach(r => {
    const div = document.createElement('div');
    div.className = `port-item ${r.status}`;
    div.innerHTML = `<div class="port-num">${r.port}</div><div class="port-status">${r.status}</div><div class="port-service">${r.service}</div>`;
    container.appendChild(div);
  });
  showResult('portscan-result');
}
$('portscan-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('portscan-btn').click(); });

// --- SSL Checker ---
$('ssl-check-btn').addEventListener('click', async function () {
  const domain = $('ssl-input').value.trim();
  const port = $('ssl-port').value || '443';
  if (!domain) { showError('ssl-error', 'Please enter a domain name'); return; }
  hideError('ssl-error'); hideResult('ssl-result'); showLoading('ssl-loading');
  try {
    const res = await fetch(`/api/ssl?data=${encodeURIComponent(domain)}&port=${port}`);
    const data = await res.json();
    hideLoading('ssl-loading');
    if (data.status === 'success') renderSslData(data.data);
    else showError('ssl-error', data.message);
  } catch (err) { hideLoading('ssl-loading'); showError('ssl-error', 'Connection error.'); }
});

function renderSslData(d) {
  const grid = $('ssl-data');
  grid.innerHTML = '';
  [
    { label: 'Domain', value: d.host, mono: true },
    { label: 'Port', value: d.port, mono: true },
    { label: 'Protocol', value: d.protocol, mono: true },
    { label: 'Authorized', value: d.authorized ? 'Yes' : 'No' },
    { label: 'Cipher', value: d.cipher ? `${d.cipher.name} (${d.cipher.version})` : 'N/A', mono: true },
    { label: 'Issuer', value: d.certificate?.issuer?.O || d.certificate?.issuer?.CN || 'N/A' },
    { label: 'Subject', value: d.certificate?.subject?.CN || 'N/A' },
    { label: 'Valid From', value: d.certificate?.validFrom || 'N/A' },
    { label: 'Valid To', value: d.certificate?.validTo || 'N/A' },
    { label: 'Days Remaining', value: d.certificate?.daysRemaining !== null ? `${d.certificate.daysRemaining} days` : 'N/A' },
    { label: 'Expired', value: d.certificate?.isExpired ? 'Yes' : 'No' },
    { label: 'Fingerprint (SHA-256)', value: d.certificate?.fingerprint256 || 'N/A', mono: true },
    { label: 'Serial Number', value: d.certificate?.serialNumber || 'N/A', mono: true }
  ].forEach(item => {
    const div = document.createElement('div');
    div.className = 'data-item';
    div.innerHTML = `<div class="label">${item.label}</div><div class="value${item.mono ? ' mono' : ''}">${item.value}</div>`;
    grid.appendChild(div);
  });
  if (d.certificate?.subjectaltname?.length) {
    const div = document.createElement('div');
    div.className = 'data-item';
    div.innerHTML = `<div class="label">Subject Alt Names</div><div class="value mono">${d.certificate.subjectaltname.join(', ')}</div>`;
    grid.appendChild(div);
  }
  showResult('ssl-result');
}
$('ssl-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('ssl-check-btn').click(); });

// Auto-detect IP on page load
document.addEventListener('DOMContentLoaded', fetchMyIp);

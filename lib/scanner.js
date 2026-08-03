// lib/scanner.js — concurrent port scan engine, worker pool + jitter (TODO 04)
import net from 'net';

export const DEFAULT_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 8080, 8443];
export const MAX_PORTS = 50;
export const MAX_CONCURRENCY = 32;
const BASE_TIMEOUT_MS = 3000;
const JITTER_MAX_MS = 800;

export const COMMON_SERVICES = {
  20: 'FTP-Data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  67: 'DHCP', 80: 'HTTP', 110: 'POP3', 111: 'RPCbind', 119: 'NNTP', 123: 'NTP',
  135: 'MSRPC', 137: 'NetBIOS', 139: 'NetBIOS-SSN', 143: 'IMAP', 161: 'SNMP',
  389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 514: 'Syslog', 587: 'SMTP Submission',
  636: 'LDAPS', 873: 'Rsync', 993: 'IMAPS', 995: 'POP3S', 1080: 'SOCKS',
  1433: 'MSSQL', 1521: 'Oracle', 1723: 'PPTP', 2049: 'NFS', 2222: 'SSH-Alt',
  2375: 'Docker', 3000: 'Grafana', 3306: 'MySQL', 3389: 'RDP', 4443: 'HTTPS-Alt',
  5000: 'Upnp', 5432: 'PostgreSQL', 5900: 'VNC', 5985: 'WinRM', 6379: 'Redis',
  6443: 'K8s-API', 8000: 'HTTP-Alt', 8008: 'HTTP-Alt', 8080: 'HTTP-Alt', 8081: 'HTTP-Alt',
  8443: 'HTTPS-Alt', 8888: 'HTTP-Alt', 9000: 'PHP-FPM', 9090: 'Prometheus',
  9200: 'Elasticsearch', 9418: 'Git', 9999: 'HTTP-Alt', 10000: 'Webmin',
  11211: 'Memcached', 15672: 'RabbitMQ', 27017: 'MongoDB', 28017: 'MongoDB-Web',
  50000: 'SAP', 61616: 'ActiveMQ'
};

export function parsePorts(input) {
  if (!input || !input.trim()) return DEFAULT_PORTS.slice();
  const parts = input.split(',');
  if (parts.some(p => !p.trim())) throw new Error(`Invalid port or range: "${input}"`);
  const ports = new Set();
  for (const r of parts) {
    const m = r.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Invalid port or range: "${r}"`);
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    if (start < 1 || end > 65535 || start > end) throw new Error(`Invalid port range: "${r}"`);
    if (end - start > MAX_PORTS) throw new Error(`Range too large: "${r}" (max ${MAX_PORTS})`);
    for (let p = start; p <= end; p++) ports.add(p);
  }
  if (ports.size === 0) throw new Error('No ports specified');
  if (ports.size > MAX_PORTS) throw new Error(`Maximum ${MAX_PORTS} ports allowed`);
  return [...ports];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scanPort(host, port, timeoutMs, bannerTimeoutMs = 1500) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const to = timeoutMs + Math.floor(Math.random() * JITTER_MAX_MS);
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(to);
    socket.on('connect', () => {
      // grab banner if the service speaks
      let banner = '';
      socket.setTimeout(bannerTimeoutMs);
      socket.on('data', chunk => {
        banner = (banner + chunk.toString('utf8')).slice(0, 120);
        if (banner.includes('\n') || banner.length > 100) done({ port, status: 'open', banner: banner.trim() || null });
      });
      setTimeout(() => done({ port, status: 'open', banner: banner.trim() || null }), bannerTimeoutMs);
    });
    socket.on('timeout', () => done({ port, status: 'filtered', banner: null }));
    socket.on('error', () => done({ port, status: 'closed', banner: null }));
    socket.connect(port, host);
  });
}

// scan(host, ports, { concurrency, onResult, signal }) → results[]
export async function scan(host, ports, { concurrency = MAX_CONCURRENCY, onResult, signal } = {}) {
  const started = Date.now();
  const results = new Array(ports.length);
  let cursor = 0;
  let cancelled = false;
  const abort = () => { cancelled = true; };
  signal?.addEventListener('abort', abort);

  async function worker() {
    while (!cancelled) {
      const idx = cursor++;
      if (idx >= ports.length) return;
      const result = await scanPort(host, ports[idx], BASE_TIMEOUT_MS);
      result.service = COMMON_SERVICES[result.port] || 'unknown';
      results[idx] = result;
      onResult?.(result, idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ports.length, MAX_CONCURRENCY) }, () => worker());
  await Promise.all(workers);
  signal?.removeEventListener('abort', abort);
  return results.filter(Boolean).sort((a, b) => a.port - b.port);
}

export default { scan, parsePorts, shuffle, DEFAULT_PORTS, MAX_PORTS, COMMON_SERVICES };

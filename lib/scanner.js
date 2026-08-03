// lib/scanner.js — HTTP-based port scanner using fetch() (Cloudflare Workers compatible)
// Replaces raw TCP sockets with HTTP probes on common ports

export const DEFAULT_PORTS = [80, 443, 8080, 8443];
export const MAX_PORTS = 50;
export const MAX_CONCURRENCY = 32;
const BASE_TIMEOUT_MS = 5000;

export const COMMON_SERVICES = {
  80: 'HTTP',
  443: 'HTTPS',
  8080: 'HTTP-Alt',
  8443: 'HTTPS-Alt',
  8000: 'HTTP-Alt',
  3000: 'Dev Server',
  5000: 'Dev Server',
  8008: 'HTTP-Alt',
  8888: 'HTTP-Alt',
  9000: 'PHP-FPM',
  4443: 'HTTPS-Alt',
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

async function probePort(host, port, timeoutMs) {
  const protocols = port === 443 || port === 8443 || port === 465 || port === 993 || port === 995
    ? ['https']
    : ['http', 'https'];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  for (const proto of protocols) {
    const url = `${proto}://${host}${port === 80 || port === 443 ? '' : `:${port}`}/`;
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timeout);
      return { port, status: 'open', service: COMMON_SERVICES[port] || 'unknown' };
    } catch { /* port not responding */ }
  }

  clearTimeout(timeout);
  return { port, status: 'closed', service: COMMON_SERVICES[port] || 'unknown' };
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
      const result = await probePort(host, ports[idx], BASE_TIMEOUT_MS);
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

// api/health.js — health checks: memory, uptime, upstream reachability (TODO 20)
import { api, ok, json } from '../lib/http.js';
import { schemas } from '../lib/schemas.js';

const started = Date.now();

async function checkUpstream(name, url, { timeoutMs = 4000, okStatus = 200 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    return { name, ok: res.status === okStatus || res.status < 400, status: res.status, latencyMs: undefined };
  } catch (err) {
    return { name, ok: false, error: err.message, latencyMs: undefined };
  }
}

async function handler(req, res, ctx) {
  const memory = process.memoryUsage();
  const memRatio = memory.heapUsed / memory.heapTotal;
  const checks = await Promise.all([
    checkUpstream('rdap.org', 'https://rdap.org/domain/example.com', { timeoutMs: 5000, okStatus: 404 }),
    checkUpstream('cloudflare-doh', 'https://cloudflare-dns.com/dns-query?name=example.com&type=A', { timeoutMs: 5000 }),
    checkUpstream('crt.sh', 'https://crt.sh/?q=example.com', { timeoutMs: 8000 })
  ]);
  const degraded = memRatio > 0.9 || checks.filter(c => !c.ok).length >= 2;
  const body = {
    status: degraded ? 'degraded' : 'ok',
    uptimeSec: Math.floor((Date.now() - started) / 1000),
    memory: { heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024), heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024), ratio: Math.round(memRatio * 100) / 100 },
    checks
  };
  res.setHeader('Cache-Control', 'no-store');
  return json(res, degraded ? 503 : 200, { status: 'success', message: degraded ? 'Degraded' : 'Healthy', data: body });
}

export default api(handler, { exempt: true, schema: null });

// lib/ratelimit.js — Sliding Window + Token Bucket, per-IP per-endpoint (TODO 03)
// Cloudflare Workers compatible: uses Web Crypto API and in-memory storage

const WINDOW_MS = 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MEMORY_MAX_KEYS = 50_000;

class MemoryStore {
  constructor() {
    this.windows = new Map();
    this.tokens = new Map();
    this.stats = { total: 0, limited: 0 };
  }
  now() { return Date.now(); }
}

let store = new MemoryStore();

function bucketKey(key) { return `rl:${key}`; }

function sweep() {
  if (store.windows.size < MEMORY_MAX_KEYS) return;
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, buckets] of store.windows) {
    for (const [ts] of buckets) if (ts < cutoff) buckets.delete(ts);
    if (buckets.size === 0) store.windows.delete(key);
  }
  if (store.windows.size > MEMORY_MAX_KEYS) {
    const keys = [...store.windows.keys()].slice(0, store.windows.size - MEMORY_MAX_KEYS);
    keys.forEach(k => store.windows.delete(k));
  }
}
setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();

function windowCount(key, now) {
  const cutoff = Math.floor((now - WINDOW_MS) / 1000);
  const buckets = store.windows.get(key);
  if (!buckets) return 0;
  let n = 0;
  for (const [ts, c] of buckets) if (ts >= cutoff) n += c;
  return n;
}

function memoryCheck(key, limit, burst, now) {
  const b = Math.floor(now / 1000);
  const buckets = store.windows.get(key) || new Map();
  const count = windowCount(key, now);
  if (count >= limit) return { allowed: false, count, retryAfter: Math.max(1, Math.ceil((b * 1000 + WINDOW_MS - now) / 1000)) };
  buckets.set(b, (buckets.get(b) || 0) + 1);
  store.windows.set(key, buckets);
  store.stats.total++;
  const tb = store.tokens.get(key);
  if (!tb || now - tb.ts > WINDOW_MS) {
    store.tokens.set(key, { count: burst - 1, ts: now });
    return { allowed: true, count: count + 1, burst: burst - 1 };
  }
  if (tb.count <= 0) {
    return { allowed: true, count: count + 1, burst: 0 };
  }
  tb.count--;
  return { allowed: true, count: count + 1, burst: tb.count };
}

export async function checkLimit(key, { limit = 30, burst = 5 } = {}) {
  return memoryCheck(key, limit, burst, Date.now());
}

export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && first !== 'unknown') return first;
  }
  const ra = req.socket?.remoteAddress || '';
  return ra === '::1' ? '127.0.0.1' : ra.replace(/^::ffff:/, '') || 'unknown';
}

export function stats() {
  return { ...store.stats, keys: store.windows.size, mode: 'memory' };
}

export async function requestId(req) {
  const existing = req.headers?.['x-request-id'];
  if (existing) return existing;
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
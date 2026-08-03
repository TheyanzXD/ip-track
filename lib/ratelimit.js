// lib/ratelimit.js — Sliding Window + Token Bucket, per-IP per-endpoint (TODO 03)
import { randomUUID } from 'crypto';

const WINDOW_MS = 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MEMORY_MAX_KEYS = 50_000;

class MemoryStore {
  constructor() {
    this.windows = new Map(); // key -> Map<secondBucket, count>
    this.tokens = new Map();  // key -> { count, ts }
    this.stats = { total: 0, limited: 0 };
  }
  now() { return Date.now(); }
}

let store = new MemoryStore();
let upstream = null;

// Upstash REST (optional): env UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
export function initUpstash(url, token) {
  if (!url || !token) return;
  upstream = {
    async get(key) {
      const res = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      return j.result === null ? null : JSON.parse(j.result);
    },
    async set(key, value, ttlSec) {
      const res = await fetch(`${url}/set/${key}/${JSON.stringify(value)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (ttlSec && res.ok) await fetch(`${url}/expire/${key}/${ttlSec}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.ok;
    }
  };
}
if (process.env.UPSTASH_REDIS_REST_URL) {
  initUpstash(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN);
}

function bucketKey(key) { return `rl:${key}`; }

function sweep() {
  if (store.windows.size < MEMORY_MAX_KEYS) return;
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, buckets] of store.windows) {
    for (const [ts] of buckets) if (ts < cutoff) buckets.delete(ts);
    if (buckets.size === 0) store.windows.delete(key);
  }
  if (store.windows.size > MEMORY_MAX_KEYS) {
    // Evict oldest keys when pathological
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
    // Burst exhausted → still allowed if under window limit (soft burst)
    return { allowed: true, count: count + 1, burst: 0 };
  }
  tb.count--;
  return { allowed: true, count: count + 1, burst: tb.count };
}

async function checkWithUpstream(key, limit, burst) {
  const now = Date.now();
  const sec = Math.floor(now / 1000);
  const current = await upstream.get(bucketKey(key));
  const count = current && current.win === sec ? current.count : 0;
  if (count >= limit) return { allowed: false, count, retryAfter: 60 };
  await upstream.set(bucketKey(key), { win: sec, count: count + 1 }, 120);
  return { allowed: true, count: count + 1, burst };
}

// limit: requests per window; burst: token bucket capacity
export async function checkLimit(key, { limit = 30, burst = 5 } = {}) {
  if (upstream) return checkWithUpstream(key, limit, burst);
  return memoryCheck(key, limit, burst, Date.now());
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && first !== 'unknown') return first;
  }
  const ra = req.socket?.remoteAddress || '';
  return ra === '::1' ? '127.0.0.1' : ra.replace(/^::ffff:/, '') || 'unknown';
}

export function stats() {
  return { ...store.stats, keys: store.windows.size, mode: upstream ? 'upstash' : 'memory' };
}

export function requestId(req) {
  return req.headers['x-request-id'] || randomUUID();
}

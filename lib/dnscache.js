// lib/dnscache.js — bounded LRU cache, TTL-aware (TODO 05)
const DEFAULT_MAX = 1000;
const DEFAULT_TTL = 60_000;

export class LruCache {
  constructor({ max = DEFAULT_MAX, defaultTtl = DEFAULT_TTL } = {}) {
    this.max = max;
    this.defaultTtl = defaultTtl;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }
  set(key, value, ttl = this.defaultTtl) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttl });
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return value;
  }
  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
  stats() {
    return { size: this.map.size, hits: this.hits, misses: this.misses, hitRate: this.hitRate() };
  }
}

export const dnsCache = new LruCache({ max: 1000, defaultTtl: 60_000 });
export const ipCache = new LruCache({ max: 1000, defaultTtl: 24 * 3600_000 });
export const ctCache = new LruCache({ max: 200, defaultTtl: 24 * 3600_000 });
export const rdapCache = new LruCache({ max: 500, defaultTtl: 3600_000 });

export function cacheStats() {
  return {
    dns: dnsCache.stats(),
    ip: ipCache.stats(),
    ct: ctCache.stats(),
    rdap: rdapCache.stats()
  };
}

export default { LruCache, dnsCache, ipCache, ctCache, rdapCache, cacheStats };

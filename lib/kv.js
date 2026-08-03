// lib/kv.js — in-memory KV with optional Cloudflare KV binding (no API keys needed)

const inMemory = new Map();

function memoryGet(key) {
  const entry = inMemory.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) { inMemory.delete(key); return null; }
  return entry.value;
}

function memorySet(key, value, ttlSec) {
  inMemory.set(key, { value, expires: Date.now() + ttlSec * 1000 });
}

function memoryDel(key) {
  inMemory.delete(key);
}

export async function kvGet(key) { return memoryGet(key); }
export async function kvSet(key, value, ttlSec) { memorySet(key, value, ttlSec); }
export async function kvDel(key) { memoryDel(key); }

// atomic-ish counter for AI budget (in-memory only)
const counters = new Map();
export async function budgetCounter(key, increment = 0) {
  const cur = counters.get(key) || 0;
  counters.set(key, cur + increment);
  return cur + increment;
}

export function kvStats() {
  return { memoryKeys: inMemory.size, mode: 'memory', counters: counters.size };
}

export default { kvGet, kvSet, kvDel, budgetCounter, kvStats };
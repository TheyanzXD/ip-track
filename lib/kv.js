// lib/kv.js — Upstash KV with in-memory fallback (TODO 11/16/17)
import { randomUUID } from 'crypto';

const inMemory = new Map();

function memoryGet(key) {
  const entry = inMemory.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) { inMemory.delete(key); return null; }
  return entry.value;
}

async function upstashGet(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryGet(key);
  const res = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (j.result === null) return null;
  try { return JSON.parse(j.result); } catch { return null; }
}

async function upstashSet(key, value, ttlSec) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    inMemory.set(key, { value, expires: Date.now() + ttlSec * 1000 });
    return;
  }
  await fetch(`${url}/set/${key}/${encodeURIComponent(JSON.stringify(value))}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (ttlSec) await fetch(`${url}/expire/${key}/${ttlSec}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function upstashDel(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { inMemory.delete(key); return; }
  await fetch(`${url}/del/${key}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function kvGet(key) { return upstashGet(key); }
export async function kvSet(key, value, ttlSec) { return upstashSet(key, value, ttlSec); }
export async function kvDel(key) { return upstashDel(key); }

// atomic-ish counter for AI budget (in-memory only; Upstash incr would need eval)
const counters = new Map();
export async function budgetCounter(key, increment = 0) {
  const cur = counters.get(key) || 0;
  counters.set(key, cur + increment);
  return cur + increment;
}

export function kvStats() {
  return { memoryKeys: inMemory.size, mode: process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'memory', counters: counters.size };
}

export default { kvGet, kvSet, kvDel, budgetCounter, kvStats };

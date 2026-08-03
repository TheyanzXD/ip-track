// lib/scanstore.js — in-memory scan registry, TTL 10 min, auto-GC (TODO 04)
const TTL_MS = 10 * 60_000;
const SWEEP_MS = 60_000;

const scans = new Map();
const sweeper = setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of scans) if (s.createdAt < cutoff) scans.delete(id);
}, SWEEP_MS);
sweeper.unref?.();

export function createScan(scanId, { host, ports, token }) {
  const entry = {
    scanId,
    host,
    ports,
    token,
    createdAt: Date.now(),
    status: 'queued', // queued → running → done | aborted
    results: [],
    open: 0,
    filtered: 0,
    closed: 0,
    startTime: null,
    endTime: null,
    subscribers: new Set()
  };
  scans.set(scanId, entry);
  return entry;
}

export function getScan(scanId) {
  const s = scans.get(scanId);
  if (!s) return null;
  if (Date.now() - s.createdAt > TTL_MS) { scans.delete(scanId); return null; }
  return s;
}

export function listScans() {
  return [...scans.entries()].map(([id, s]) => ({ scanId: id, host: s.host, status: s.status, createdAt: s.createdAt }));
}

export function snapshot(scan) {
  return {
    scanId: scan.scanId,
    host: scan.host,
    status: scan.status,
    totalScanned: scan.ports.length,
    open: scan.open,
    filtered: scan.filtered,
    closed: scan.closed,
    durationMs: scan.startTime ? Date.now() - scan.startTime : null,
    results: scan.results
  };
}

export function stats() { return { active: scans.size }; }

export default { createScan, getScan, listScans, snapshot, stats };

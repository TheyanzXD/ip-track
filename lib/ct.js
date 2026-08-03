// lib/ct.js — Certificate Transparency + subdomain discovery (TODO 06)
import { ctCache } from './dnscache.js';

const CRT_SH_TIMEOUT = 15_000;

async function crtSh(domain) {
  const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, {
    headers: { 'User-Agent': 'NetUtils/2.0 (CT audit)' },
    signal: AbortSignal.timeout(CRT_SH_TIMEOUT)
  });
  if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
  return res.json();
}

async function certspotter(domain) {
  const res = await fetch(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`, {
    signal: AbortSignal.timeout(CRT_SH_TIMEOUT)
  });
  if (!res.ok) throw new Error(`certspotter HTTP ${res.status}`);
  return res.json();
}

function parseCrtsh(rows) {
  const byName = new Map();
  for (const row of rows) {
    const names = new Set();
    if (row.name_value) row.name_value.split('\n').forEach(n => names.add(n.trim().replace(/\.$/, '')));
    if (row.common_name) names.add(row.common_name.replace(/\.$/, ''));
    for (const name of names) {
      if (!name || !name.includes('.')) continue;
      const wildcard = name.startsWith('*.');
      const key = wildcard ? name : name.toLowerCase();
      const entry = byName.get(key) || {
        name: wildcard ? name.slice(2) : name,
        wildcard,
        issuers: new Set(),
        firstSeen: row.entry_timestamp || row.not_before,
        lastSeen: row.not_after || row.entry_timestamp
      };
      if (row.issuer_name) entry.issuers.add(row.issuer_name);
      if (row.entry_timestamp && (!entry.firstSeen || row.entry_timestamp < entry.firstSeen)) entry.firstSeen = row.entry_timestamp;
      if (row.not_after && (!entry.lastSeen || row.not_after > entry.lastSeen)) entry.lastSeen = row.not_after;
      byName.set(key, entry);
    }
  }
  return [...byName.values()].map(e => ({ ...e, issuers: [...e.issuers] }));
}

function parseCertspotter(rows) {
  const byName = new Map();
  for (const cert of rows) {
    const names = cert.dns_names || [];
    for (const name of names) {
      if (!name.includes('.')) continue;
      const wildcard = name.startsWith('*.');
      const key = wildcard ? name : name.toLowerCase();
      const entry = byName.get(key) || {
        name: wildcard ? name.slice(2) : name,
        wildcard,
        issuers: new Set(),
        firstSeen: cert.not_before || null,
        lastSeen: cert.not_after || null
      };
      if (cert.issuer?.name) entry.issuers.add(cert.issuer.name);
      byName.set(key, entry);
    }
  }
  return [...byName.values()].map(e => ({ ...e, issuers: [...e.issuers] }));
}

function buildTimeline(entries) {
  const counts = new Map();
  for (const e of entries) {
    const month = (e.firstSeen || '').slice(0, 7);
    if (!month) continue;
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .slice(-24)
    .map(([month, count]) => ({ month, count }));
}

export async function lookupCt(domain) {
  const cacheKey = `ct:${domain}`;
  const hit = ctCache.get(cacheKey);
  if (hit) return hit;

  const sources = [];
  let entries = [];
  let sourceTag = '';
  let err1 = null, err2 = null;

  try {
    const rows = await crtSh(domain);
    entries = parseCrtsh(rows);
    sources.push('crt.sh');
  } catch (err) { err1 = err; }
  if (entries.length === 0) {
    try {
      const rows = await certspotter(domain);
      entries = parseCertspotter(rows);
      sources.push('certspotter');
    } catch (err) { err2 = err; }
  }

  if (entries.length === 0 && !err1 && !err2) {
    throw { code: 'NOT_FOUND', message: `No certificate transparency entries for ${domain}` };
  }
  if (entries.length === 0) {
    throw { code: 'UPSTREAM_ERROR', message: `CT sources unreachable (crt.sh: ${err1?.message}, certspotter: ${err2?.message})` };
  }

  entries.sort((a, b) => (a.firstSeen || '').localeCompare(b.firstSeen || ''));
  const result = {
    domain,
    source: sources.join(','),
    totalCertificates: entries.length,
    subdomains: entries,
    timeline: buildTimeline(entries),
    meta: { sources, at: new Date().toISOString() }
  };
  ctCache.set(cacheKey, result);
  return result;
}

export default { lookupCt };

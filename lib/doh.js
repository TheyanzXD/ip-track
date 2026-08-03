// lib/doh.js — DoH resolvers, resolver diff, DNSSEC flags (TODO 05)
import { dnsCache } from './dnscache.js';

const PROVIDERS = {
  cloudflare: {
    url: 'https://cloudflare-dns.com/dns-query',
    name: 'Cloudflare (1.1.1.1)',
    ip: '1.1.1.1'
  },
  google: {
    url: 'https://dns.google/resolve',
    name: 'Google (8.8.8.8)',
    ip: '8.8.8.8'
  },
  quad9: {
    url: 'https://dns.quad9.net:5053/dns-query',
    name: 'Quad9 (9.9.9.9)',
    ip: '9.9.9.9'
  }
};

export const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'SRV'];

const TIMEOUT_MS = 5000;

function dohQuery(provider, type, domain) {
  const url = `${provider.url}?name=${encodeURIComponent(domain)}&type=${type}`;
  return fetch(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).then(async res => {
    if (!res.ok) throw new Error(`DoH ${provider.name} HTTP ${res.status}`);
    return res.json();
  });
}

function normalizeAnswer(j, type, provider) {
  const records = [];
  const answer = j.Answer || [];
  if (type === 'A' || type === 'AAAA' || type === 'CNAME' || type === 'NS') {
    for (const a of answer) if (a.type === (type === 'AAAA' ? 28 : type === 'A' ? 1 : type === 'CNAME' ? 5 : 2)) records.push({ value: a.data.replace(/\.$/, ''), ttl: a.TTL });
  } else if (type === 'MX') {
    for (const a of answer) if (a.type === 15) {
      const m = a.data.match(/(\d+)\s+(\S+)/);
      if (m) records.push({ priority: parseInt(m[1], 10), exchange: m[2].replace(/\.$/, ''), ttl: a.TTL });
    }
  } else if (type === 'TXT') {
    for (const a of answer) if (a.type === 16) records.push({ value: a.data.replace(/^"|"$/g, ''), ttl: a.TTL });
  } else if (type === 'SRV') {
    for (const a of answer) if (a.type === 33) {
      const [p, w, port, target] = a.data.trim().split(/\s+/);
      records.push({ priority: +p, weight: +w, port: +port, name: target.replace(/\.$/, ''), ttl: a.TTL });
    }
  } else if (type === 'SOA') {
    const a = answer.find(x => x.type === 32);
    if (a) {
      const [nsname, hostmaster, ...rest] = a.data.trim().split(/\s+/);
      records.push({ nsname, hostmaster, serial: +rest[0], refresh: +rest[1], retry: +rest[2], expire: +rest[3], minttl: +rest[4], ttl: a.TTL });
    }
  }
  return records;
}

function flagDetails(j) {
  const ad = (j.Status & 32) === 32;   // Authenticated Data
  const cd = (j.Status & 16) === 16;   // Checking Disabled
  return { ad, cd, rawStatus: j.Status, codes: j.Comment ? [j.Comment] : [] };
}

export async function queryResolver(providerId, type, domain, { cache = true } = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown resolver ${providerId}`);
  const key = `doh:${providerId}:${type}:${domain}`;
  if (cache) {
    const hit = dnsCache.get(key);
    if (hit) return hit;
  }
  const j = await dohQuery(provider, type, domain);
  const result = {
    provider: providerId,
    providerName: provider.name,
    serverIp: provider.ip,
    type,
    domain,
    records: normalizeAnswer(j, type, provider),
    status: j.Status,
    flags: flagDetails(j)
  };
  if (cache) dnsCache.set(key, result, 60_000);
  return result;
}

export async function queryAllResolvers(type, domain, { cache = true } = {}) {
  const keys = Object.keys(PROVIDERS);
  const settled = await Promise.allSettled(keys.map(k => queryResolver(k, type, domain, { cache })));
  const out = {};
  settled.forEach((s, i) => {
    out[keys[i]] = s.status === 'fulfilled' ? s.value : { provider: keys[i], providerName: PROVIDERS[keys[i]].name, error: s.reason?.message || 'resolver failed', records: [] };
  });
  return out;
}

function valueOf(record) {
  if (record.priority !== undefined) return `${record.priority}:${record.exchange || record.name}`;
  return record.value || record.nsname || `${record.name}:${record.port}`;
}

export function resolverDiff(resolvers) {
  const diffs = [];
  for (const type of RECORD_TYPES) {
    const perResolver = {};
    for (const [id, r] of Object.entries(resolvers)) {
      if (!r || r.error || r.type !== type) continue;
      perResolver[id] = new Set(r.records.map(valueOf));
    }
    const ids = Object.keys(perResolver);
    if (ids.length < 2) continue;
    const allValues = new Set();
    ids.forEach(id => perResolver[id].forEach(v => allValues.add(v)));
    for (const v of allValues) {
      const missing = ids.filter(id => !perResolver[id].has(v));
      if (missing.length > 0) {
        diffs.push({ type, value: v, presentIn: ids.filter(id => perResolver[id].has(v)), missingIn: missing });
      }
    }
  }
  return diffs;
}

export function dnssecStatus(providerFlags) {
  // providerFlags: { providerId: { flags: {ad,cd} } }
  const statuses = [];
  for (const p of Object.values(providerFlags)) {
    if (!p) continue;
    if (p.error) continue;
    const ad = !!(p.flags && p.flags.ad);
    const rrsig = p.rrsig || false;
    if (ad) statuses.push('validated');
    else if (rrsig) statuses.push('secure');
    else statuses.push('none');
  }
  if (statuses.length === 0) return { status: 'unknown', ad: false, details: 'All resolvers failed' };
  if (statuses.includes('validated')) return { status: 'validated', ad: true, details: 'Authenticated data (AD flag) set by at least one resolver' };
  if (statuses.includes('secure')) return { status: 'secure', ad: false, details: 'Signatures present but AD not asserted' };
  return { status: 'none', ad: false, details: 'No DNSSEC signatures observed' };
}

export function flattenRecords(resolvers, primaryId = 'cloudflare') {
  const primary = resolvers[primaryId];
  if (primary && !primary.error) {
    const records = {};
    for (const t of RECORD_TYPES) {
      if (primary.type === t) records[t] = primary.records;
    }
    if (Object.keys(records).length > 0) return records;
  }
  // Merge whatever each resolver answered
  const merged = {};
  for (const r of Object.values(resolvers)) {
    if (!r || r.error) continue;
    if (!merged[r.type]) merged[r.type] = [];
    merged[r.type].push(...r.records);
  }
  return merged;
}

export { PROVIDERS };
export default { PROVIDERS, RECORD_TYPES, queryResolver, queryAllResolvers, resolverDiff, dnssecStatus, flattenRecords };

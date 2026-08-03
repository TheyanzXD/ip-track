// lib/rdap.js — RDAP-first WHOIS with raw whois fallback (TODO 02)
import net from 'net';
import { rdapCache } from './dnscache.js';

const RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const RDAP_FALLBACK = 'https://rdap.org';
const WHOIS_PORT = 43;
const WHOIS_TIMEOUT_MS = 10_000;
const RDAP_TIMEOUT_MS = 6_000;

let bootstrapCache = null;
let bootstrapAt = 0;
const BOOTSTRAP_TTL = 24 * 3600_000;

async function getBootstrap() {
  if (bootstrapCache && Date.now() - bootstrapAt < BOOTSTRAP_TTL) return bootstrapCache;
  try {
    const res = await fetch(RDAP_BOOTSTRAP_URL, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      bootstrapCache = await res.json();
      bootstrapAt = Date.now();
      return bootstrapCache;
    }
  } catch { /* fall through */ }
  return bootstrapCache || { services: [] };
}

function rdapUrlForDomain(bootstrap, domain) {
  const tld = domain.split('.').pop().toLowerCase();
  const services = bootstrap.services || [];
  for (const [tlds, urls] of services) {
    if (tlds.some(t => t.toLowerCase() === tld)) return urls[0].replace(/\/$/, '');
  }
  return RDAP_FALLBACK;
}

async function rdapQuery(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/rdap+json' },
    signal: AbortSignal.timeout(RDAP_TIMEOUT_MS)
  });
  if (!res.ok) {
    if (res.status === 404) throw { code: 'NOT_FOUND', message: `No RDAP data for ${url.split('/').pop()}` };
    throw new Error(`RDAP HTTP ${res.status}`);
  }
  return res.json();
}

function normalizeRdap(j) {
  const events = {};
  (j.events || []).forEach(e => { events[e.eventAction] = e.eventDate; });
  const status = (j.status || []).map(s => s.toLowerCase());
  const abuse = (j.entities || []).flatMap(e =>
    (e.vcardArray?.[1] || []).filter(v => v[0] === 'email' && String(v[1] || '').toLowerCase().includes('abuse'))
      .map(v => v[3])
  ).find(Boolean) || null;

  const registrantEntity = (j.entities || []).find(e => e.roles?.includes('registrant'));
  let registrant = null;
  if (registrantEntity?.vcardArray) {
    const vcard = {};
    for (const v of registrantEntity.vcardArray[1] || []) {
      const key = v[0] === 'fn' ? 'name' : v[0];
      vcard[key] = v[3];
    }
    registrant = { name: vcard.name || null, email: vcard.email || null, org: vcard.org || null };
  }

  return {
    registrar: (j.entities || []).find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || null,
    creationDate: events.registration || null,
    expiryDate: events.expiration || null,
    updatedDate: events.last_changed || null,
    nameservers: (j.nameservers || []).map(ns => ns.ldomain),
    status,
    abuseEmail: abuse,
    registrant,
    dnssec: (j.secureDNS?.delegationSigned === true) || status.includes('dnssec:secure')
  };
}

function rawWhoisQuery(host, query) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(WHOIS_PORT, host);
    let data = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('WHOIS server timed out')); }, WHOIS_TIMEOUT_MS);
    socket.setEncoding('utf8');
    socket.on('data', chunk => { data += chunk; if (data.length > 200_000) { socket.destroy(); resolve(data); } });
    socket.on('error', err => { clearTimeout(timer); reject(err); });
    socket.on('close', () => { clearTimeout(timer); resolve(data); });
    socket.write(query + '\r\n');
  });
}

function parseRawWhois(raw) {
  const out = { status: [], nameservers: [] };
  const events = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!val) continue;
    switch (key) {
      case 'registrar': out.registrar = val; break;
      case 'name server': out.nameservers.push(val.toLowerCase()); break;
      case 'status': out.status.push(val.toLowerCase()); break;
      case 'abuse contact': out.abuseEmail = val; break;
      case 'created': case 'registration time': case 'domain registration date': events.registration = val; break;
      case 'expir': case 'registry expiry date': case 'expiration time': case 'domain expiry date': events.expiration = val; break;
      case 'last updated': case 'updated date': case 'domain update date': events.last_changed = val; break;
      case 'dnssec': out.dnssec = /signed|secure|yes|active/i.test(val); break;
      default: break;
    }
  }
  out.creationDate = events.registration || null;
  out.expiryDate = events.expiration || null;
  out.updatedDate = events.last_changed || null;
  return out;
}

export async function lookupDomain(domain) {
  const cacheKey = `rdap:${domain}`;
  const hit = rdapCache.get(cacheKey);
  if (hit) return hit;

  const bootstrap = await getBootstrap();
  const base = rdapUrlForDomain(bootstrap, domain);
  let lastErr = null;
  try {
    const j = await rdapQuery(`${base}/domain/${domain}`);
    const result = { ...normalizeRdap(j), source: 'rdap', raw: null };
    rdapCache.set(cacheKey, result);
    return result;
  } catch (err) {
    lastErr = err;
    if (err.code === 'NOT_FOUND') throw err;
  }
  // Fallback: raw whois to IANA whois server
  try {
    const raw = await rawWhoisQuery('whois.iana.org', `domain ${domain}`);
    if (!raw.includes('NOT FOUND')) {
      const parsed = parseRawWhois(raw);
      const result = { ...parsed, source: 'whois-iana', raw: raw.slice(0, 4000) };
      rdapCache.set(cacheKey, result);
      return result;
    }
  } catch (err) { lastErr = err; }
  throw { code: 'UNRESOLVABLE', message: `No registration data for ${domain}${lastErr ? ` (${lastErr.message})` : ''}` };
}

export async function lookupIp(ip) {
  const cacheKey = `rdap-ip:${ip}`;
  const hit = rdapCache.get(cacheKey);
  if (hit) return hit;
  try {
    const j = await rdapQuery(`${RDAP_FALLBACK}/ip/${ip}`);
    const net = j;
    const handle = net.handle || ip;
    const result = {
      target: ip,
      kind: 'ip',
      source: 'rdap',
      registrar: null,
      creationDate: null,
      expiryDate: null,
      updatedDate: null,
      nameservers: [],
      status: (net.status || []).map(s => s.toLowerCase()),
      abuseEmail: null,
      registrant: null,
      dnssec: false,
      raw: null,
      meta: { handle, range: net.startAddress ? `${net.startAddress} - ${net.endAddress}` : null, name: net.name || null }
    };
    rdapCache.set(cacheKey, result);
    return result;
  } catch {
    throw { code: 'UNRESOLVABLE', message: `No RDAP data for IP ${ip}` };
  }
}

export async function lookupAsn(asn) {
  const clean = String(asn).replace(/^AS/i, '');
  const cacheKey = `rdap-asn:${clean}`;
  const hit = rdapCache.get(cacheKey);
  if (hit) return hit;
  try {
    const j = await rdapQuery(`${RDAP_FALLBACK}/autnum/${clean}`);
    const result = {
      target: `AS${clean}`,
      kind: 'asn',
      source: 'rdap',
      registrar: (j.entities || []).find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || null,
      creationDate: null, expiryDate: null, updatedDate: null,
      nameservers: [], status: (j.status || []).map(s => s.toLowerCase()),
      abuseEmail: (j.entities || []).flatMap(e => (e.vcardArray?.[1] || []).filter(v => v[0] === 'email' && String(v[1]).toLowerCase().includes('abuse')).map(v => v[3])).find(Boolean) || null,
      registrant: null, dnssec: false, raw: null,
      meta: { handle: j.handle || `AS${clean}`, name: j.name || null, start: j.startAutnum, end: j.endAutnum }
    };
    rdapCache.set(cacheKey, result);
    return result;
  } catch {
    throw { code: 'UNRESOLVABLE', message: `No RDAP data for AS${clean}` };
  }
}

export function whoisHint(raw) {
  if (!raw) return null;
  const m = raw.match(/Whois Server:\s*([^\r\n]+)/i);
  return m ? m[1].trim() : null;
}

export default { lookupDomain, lookupIp, lookupAsn };

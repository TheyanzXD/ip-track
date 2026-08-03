// lib/rdap.js — RDAP-first WHOIS with HTTP-based fallback (Cloudflare Workers compatible)
// Replaces raw TCP WHOIS with HTTP-based RDAP only

const RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const RDAP_FALLBACK = 'https://rdap.org';
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

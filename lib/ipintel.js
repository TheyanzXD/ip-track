// lib/ipintel.js — multi-provider IP intelligence with failover + health (TODO 08)
import { ipCache } from './dnscache.js';
import { isBlocked, guardIp } from './netguard.js';

const PROVIDER_TIMEOUT_MS = 4000;
const COOLDOWN_MS = 60_000;

const PROVIDERS = [
  {
    id: 'ip-api.com',
    async lookup(ip) {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,org,as,timezone,lat,lon,query,mobile,proxy,hosting`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
      const j = await res.json();
      if (j.status === 'fail') throw new Error(j.message || 'ip-api fail');
      return {
        ip: j.query,
        country: j.country || null, region: j.regionName || null, city: j.city || null,
        isp: j.isp || null, organization: j.org || null, asn: j.as || null,
        timezone: j.timezone || null, latitude: j.lat ?? null, longitude: j.lon ?? null,
        mobile: !!j.mobile, proxy: !!j.proxy, hosting: !!j.hosting,
        accuracyRadius: 1000, source: 'ip-api.com'
      };
    }
  },
  {
    id: 'ipwho.is',
    async lookup(ip) {
      const res = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
      const j = await res.json();
      if (j.success === false) throw new Error(j.message || 'ipwho.is fail');
      return {
        ip,
        country: j.country || null, region: j.region || null, city: j.city || null,
        isp: j.connection?.isp || null, organization: j.connection?.org || null,
        asn: j.connection?.asn ? `AS${j.connection.asn}` : null,
        timezone: j.timezone?.id || null,
        latitude: j.latitude ?? null, longitude: j.longitude ?? null,
        mobile: !!j.connection?.mobile, proxy: !!j.security?.proxy,
        hosting: !!j.connection?.type || null,
        threat: {
          isTor: !!j.security?.tor, isVpn: !!j.security?.vpn,
          isDatacenter: !!j.connection?.type || null, isAbuser: !!j.security?.abuse || null,
          score: j.security?.risk || null
        },
        accuracyRadius: j.accuracy || null, source: 'ipwho.is'
      };
    }
  },
  {
    id: 'ipinfo.io',
    requires: 'IPINFO_TOKEN',
    async lookup(ip) {
      const res = await fetch(`https://ipinfo.io/${ip}/json`, {
        headers: { Authorization: `Bearer ${process.env.IPINFO_TOKEN}` },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`ipinfo ${res.status}`);
      const j = await res.json();
      const [lat, lon] = (j.loc || ',').split(',').map(Number);
      const orgParts = (j.org || '').split(' ');
      return {
        ip,
        country: j.country || null, region: j.region || null, city: j.city || null,
        isp: orgParts.slice(1).join(' ') || null, organization: j.org || null,
        asn: orgParts[0] || null,
        timezone: j.timezone || null, latitude: lat ?? null, longitude: lon ?? null,
        mobile: !!j.mobile, proxy: !!j.privacy?.proxy, hosting: !!j.company?.type,
        threat: {
          isTor: !!j.privacy?.tor, isVpn: !!j.privacy?.vpn,
          isDatacenter: !!j.privacy?.hosting, isAbuser: !!j.abuse?.country || null,
          score: null
        },
        accuracyRadius: j.accuracy || null, source: 'ipinfo.io'
      };
    }
  }
];

// health: sliding failure counter + cooldown
const health = new Map();
function providerHealthy(p) {
  const h = health.get(p.id) || { failures: 0, cooldownUntil: 0 };
  if (Date.now() < h.cooldownUntil) return false;
  return h.failures < 3;
}
function recordFailure(p) {
  const h = health.get(p.id) || { failures: 0, cooldownUntil: 0 };
  h.failures++;
  if (h.failures >= 3) h.cooldownUntil = Date.now() + COOLDOWN_MS;
  health.set(p.id, h);
}
function recordSuccess(p) {
  health.set(p.id, { failures: 0, cooldownUntil: 0 });
}

export function providerHealth() {
  return [...health.entries()].map(([id, h]) => ({ id, ...h, healthy: providerHealthy({ id }) }));
}

export async function reverseDns(ip) {
  const dns = await import('dns');
  return new Promise(resolve => dns.reverse(ip, (err, hosts) => {
    resolve(err || !hosts || hosts.length === 0 ? null : hosts[0]);
  }));
}

export async function lookupIp(ip) {
  guardIp(ip);
  const cached = ipCache.get(ip);
  if (cached) {
    return { ...cached, meta: { ...cached.meta, cached: true, elapsedMs: 0 } };
  }
  const started = Date.now();
  let lastErr = null;
  for (const p of PROVIDERS) {
    if (p.requires && !process.env[p.requires]) continue;
    if (!providerHealthy(p)) continue;
    try {
      const data = await p.lookup(ip);
      recordSuccess(p);
      const result = {
        ...data,
        ip,
        meta: {
          provider: p.id,
          source: data.source || p.id,
          cached: false,
          elapsedMs: Date.now() - started,
          accuracyRadius: data.accuracyRadius
        }
      };
      ipCache.set(ip, result, 24 * 3600_000);
      return result;
    } catch (err) {
      recordFailure(p);
      lastErr = err;
    }
  }
  // Last resort: local RDAP-ish lookup → structured error
  throw {
    code: 'UPSTREAM_ERROR',
    message: `All IP intelligence providers unavailable${lastErr ? `: ${lastErr.message}` : ''}`
  };
}

export { isBlocked, providerHealth as health };

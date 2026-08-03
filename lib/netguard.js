// lib/netguard.js — SSRF Protection Layer + Input Validation Engine (TODO 01)
// Cloudflare Workers compatible: uses DoH via fetch() instead of node:dns
import { domainToASCII } from 'url';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 5000;

export const ERR = {
  BLOCKED_TARGET: 'BLOCKED_TARGET',
  REBINDING_DETECTED: 'REBINDING_DETECTED',
  INVALID_TARGET: 'INVALID_TARGET',
  UNRESOLVABLE: 'UNRESOLVABLE'
};

export const ALLOWED_SCHEMES = ['http:', 'https:'];
export const DEFAULT_ALLOWED_PORTS = [80, 443, 8080, 8443];

const TLD_RE = /^[a-z0-9-]{2,63}$/;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const PUNY_RE = /^xn--/;

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function inCidr(ip, base, bits) {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function classifyIP(ip) {
  if (!isIP(ip)) return { kind: 'invalid', label: 'invalid' };
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::') return { kind: 'unspecified', label: 'unspecified' };
    if (lower === '::1') return { kind: 'loopback', label: 'IPv6 loopback' };
    if (lower.startsWith('fe80:')) return { kind: 'linklocal', label: 'IPv6 link-local' };
    if (lower.startsWith('fc') || lower.startsWith('fd')) return { kind: 'ula', label: 'IPv6 ULA' };
    if (lower.startsWith('ff')) return { kind: 'multicast', label: 'IPv6 multicast' };
    if (lower.startsWith('2001:db8')) return { kind: 'documentation', label: 'IPv6 documentation' };
    const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return classifyIP(m[1]);
    return { kind: 'public', label: 'IPv6 public' };
  }
  if (inCidr(ip, '10.0.0.0', 8)) return { kind: 'private', label: 'RFC1918 private (10/8)' };
  if (inCidr(ip, '172.16.0.0', 12)) return { kind: 'private', label: 'RFC1918 private (172.16/12)' };
  if (inCidr(ip, '192.168.0.0', 16)) return { kind: 'private', label: 'RFC1918 private (192.168/16)' };
  if (inCidr(ip, '127.0.0.0', 8)) return { kind: 'loopback', label: 'Loopback (127/8)' };
  if (inCidr(ip, '169.254.0.0', 16)) {
    return ip === '169.254.169.254'
      ? { kind: 'metadata', label: 'Cloud metadata (169.254.169.254)' }
      : { kind: 'linklocal', label: 'Link-local (169.254/16)' };
  }
  if (inCidr(ip, '100.64.0.0', 10)) return { kind: 'cgNat', label: 'CGNAT (100.64/10)' };
  if (inCidr(ip, '192.0.0.0', 24)) return { kind: 'reserved', label: 'IETF reserved (192.0.0/24)' };
  if (inCidr(ip, '198.18.0.0', 15)) return { kind: 'reserved', label: 'Benchmarking (198.18/15)' };
  if (inCidr(ip, '0.0.0.0', 8)) return { kind: 'unspecified', label: 'Unspecified (0/8)' };
  if (ip === '255.255.255.255') return { kind: 'broadcast', label: 'Broadcast' };
  if (inCidr(ip, '224.0.0.0', 4)) return { kind: 'multicast', label: 'Multicast (224/4)' };
  if (inCidr(ip, '240.0.0.0', 4)) return { kind: 'reserved', label: 'Reserved (240/4)' };
  return { kind: 'public', label: 'Public IPv4' };
}

export const BLOCKED_KINDS = new Set(['private', 'loopback', 'linklocal', 'metadata', 'cgNat', 'reserved', 'unspecified', 'multicast', 'broadcast', 'ula', 'documentation']);

export function isBlocked(ip) {
  const cls = classifyIP(ip);
  return { blocked: BLOCKED_KINDS.has(cls.kind), cls };
}

function isIP(ip) {
  return isIPv4(ip) || isIPv6(ip);
}

function isIPv4(ip) {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) &&
    ip.split('.').every(o => parseInt(o, 10) <= 255);
}

function isIPv6(ip) {
  try {
    const normalized = ip.replace(/^\[|\]$/g, '');
    if (normalized.includes(':')) return true;
  } catch { /* not IPv6 */ }
  return false;
}

// Parse + normalize target. Returns { type, value, ascii } or throws INVALID_TARGET.
export function parseTarget(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw { code: ERR.INVALID_TARGET, message: 'Target is required' };
  }
  const raw = input.trim();
  if (raw.length > 253) throw { code: ERR.INVALID_TARGET, message: 'Target exceeds 253 characters' };
  let candidate = raw.replace(/^\[|\]$/g, '');
  let url = null;
  if (candidate.includes('://')) {
    try { url = new URL(candidate); } catch { /* not a URL */ }
  }
  if (url && ALLOWED_SCHEMES.includes(url.protocol)) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host) throw { code: ERR.INVALID_TARGET, message: 'URL has no hostname' };
    const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
    return { type: 'url', value: raw, host, port, asciiHost: normalizeHost(host) };
  }
  if (url) candidate = url.hostname; // non-http(s) URL: extract host for domain/IP handling
  if (isIP(candidate)) {
    return { type: isIPv6(candidate) ? 'ipv6' : 'ipv4', value: candidate, asciiHost: candidate };
  }
  return { type: 'domain', value: normalizeHost(candidate), asciiHost: normalizeHost(candidate) };
}

export function normalizeHost(host) {
  let h = host.trim().toLowerCase().replace(/\.$/, '');
  if (isIP(h)) return h;
  try { h = domainToASCII(h); } catch { /* keep */ }
  if (!h) throw { code: ERR.INVALID_TARGET, message: 'Invalid hostname' };
  const labels = h.split('.');
  if (labels.length < 2 || !labels.every(l => LABEL_RE.test(l))) {
    throw { code: ERR.INVALID_TARGET, message: 'Invalid hostname format' };
  }
  if (!TLD_RE.test(labels[labels.length - 1])) {
    throw { code: ERR.INVALID_TARGET, message: 'Invalid top-level domain' };
  }
  if (labels.some(l => l.length > 63)) throw { code: ERR.INVALID_TARGET, message: 'Hostname label too long' };
  return h;
}

export function isPunycode(host) {
  return host.split('.').some(l => PUNY_RE.test(l));
}

// Resolve host to first PUBLIC IP using DoH (Cloudflare DNS-over-HTTPS).
async function resolvePublic(hostname) {
  const ips = [];
  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) {
      const j = await res.json();
      for (const a of (j.Answer || [])) {
        if (a.type === 1) ips.push({ ip: a.data, family: 4 });
      }
    }
  } catch { /* DoH A lookup failed */ }

  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=AAAA`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) {
      const j = await res.json();
      for (const a of (j.Answer || [])) {
        if (a.type === 28) ips.push({ ip: a.data, family: 6 });
      }
    }
  } catch { /* DoH AAAA lookup failed */ }

  if (ips.length === 0) throw { code: ERR.UNRESOLVABLE, message: `Unable to resolve ${hostname}` };
  const blocked = ips.filter(a => isBlocked(a.ip).blocked);
  const publics = ips.filter(a => !isBlocked(a.ip).blocked);
  if (blocked.length > 0 && publics.length === 0) {
    const cls = classifyIP(blocked[0].ip);
    throw {
      code: ERR.BLOCKED_TARGET,
      message: `${hostname} resolves to blocked address ${blocked[0].ip} (${cls.label})`
    };
  }
  return { publics, blocked };
}

const REBIND_DELAY_MS = 500;

export async function guardHost(hostname, { doubleResolve = true } = {}) {
  const first = await resolvePublic(hostname);
  if (!doubleResolve) return first.publics[0].ip;
  await new Promise(r => setTimeout(r, REBIND_DELAY_MS));
  const second = await resolvePublic(hostname);
  const firstSet = new Set(first.publics.map(a => a.ip));
  if (second.publics.length === 0) throw { code: ERR.BLOCKED_TARGET, message: `${hostname} no longer resolves publicly` };
  const overlap = second.publics.filter(a => firstSet.has(a.ip));
  if (overlap.length === 0) {
    throw { code: ERR.REBINDING_DETECTED, message: `DNS rebinding suspected for ${hostname}: answers changed between lookups` };
  }
  return overlap[0].ip;
}

export function guardIp(ip) {
  const { blocked, cls } = isBlocked(ip);
  if (blocked) throw { code: ERR.BLOCKED_TARGET, message: `${ip} is not routable (${cls.label})` };
  return ip;
}

export function guardPort(port, allowedPorts = DEFAULT_ALLOWED_PORTS) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw { code: ERR.INVALID_TARGET, message: 'Port must be 1-65535' };
  }
  if (!allowedPorts.includes(port)) {
    throw { code: ERR.BLOCKED_TARGET, message: `Port ${port} not in allowed set [${allowedPorts.join(', ')}]` };
  }
  return port;
}

// Full URL guard: scheme + port + host resolution. Returns guarded URL info.
export async function guardUrl(input, { allowedPorts = DEFAULT_ALLOWED_PORTS, doubleResolve = true } = {}) {
  let parsed;
  try { parsed = new URL(input); } catch {
    throw { code: ERR.INVALID_TARGET, message: 'Invalid URL' };
  }
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    throw { code: ERR.BLOCKED_TARGET, message: `Scheme ${parsed.protocol} not allowed (http/https only)` };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  guardPort(port, allowedPorts);
  if (isIP(host)) guardIp(host);
  else await guardHost(host, { doubleResolve });
  return { protocol: parsed.protocol, host, port, path: parsed.pathname + parsed.search };
}

export function maxRedirects(chain, limit = 5) {
  if (chain.length > limit) {
    throw { code: ERR.BLOCKED_TARGET, message: `Redirect chain exceeds ${limit} hops` };
  }
  return true;
}

export function sanitizeQuery(q) {
  if (!q || typeof q !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === 'string') out[k] = v.slice(0, 2000);
    else out[k] = v;
  }
  return out;
}

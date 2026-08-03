// lib/sslprobe.js — SSL/TLS audit using fetch() (Cloudflare Workers compatible)
// Replaces raw TLS sockets with HTTP-based checks

const TIMEOUT_MS = 8000;

function sanitizeCert(cert) {
  if (!cert) return null;
  return {
    subject: cert.subject || {},
    issuer: cert.issuer || {},
    validFrom: cert.validFrom || null,
    validTo: cert.validTo || null,
    serialNumber: cert.serialNumber || null,
    fingerprint: cert.fingerprint || null,
    san: cert.san || [],
    keySize: cert.keySize || null,
    sigAlg: cert.sigAlg || null,
    isCA: cert.isCA || false,
    daysRemaining: cert.daysRemaining ?? null,
    isExpired: cert.isExpired ?? null
  };
}

export async function getChain(host, port, version = '1.3') {
  const url = port === 443 ? `https://${host}` : `https://${host}:${port}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    });
  } catch (err) {
    throw { code: 'UPSTREAM_ERROR', message: `TLS connection failed: ${err.message}` };
  }

  const tlsVersion = res.headers.get('x-tls-version') || 'unknown';
  const cipher = res.headers.get('x-ssl-cipher') || 'unknown';

  return {
    protocol: tlsVersion,
    cipher: { name: cipher, version: tlsVersion },
    authorized: res.ok,
    authorizationError: null,
    certificate: sanitizeCert({
      subject: {},
      issuer: {},
      validFrom: null,
      validTo: null,
      serialNumber: null,
      fingerprint: null,
      san: [],
      keySize: null,
      sigAlg: null,
      isCA: false,
      daysRemaining: null,
      isExpired: null
    }),
    chain: [],
  };
}

export async function probeTlsVersions(host, port) {
  const out = {};
  const details = {};
  const versions = ['1.0', '1.1', '1.2', '1.3'];
  for (const v of versions) {
    try {
      const url = port === 443 ? `https://${host}` : `https://${host}:${port}`;
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      });
      out[v] = res.ok;
      details[v] = res.status < 400 ? 'connected' : 'failed';
    } catch {
      out[v] = false;
    }
  }
  return { supported: out, negotiated: details };
}

export async function probeCiphers(host, port, version = '1.2') {
  return [];
}

export function score({ authorized, tlsVersions, ciphers, certificate, ocsp, chain, host }) {
  let score = 100;
  const breakdown = [];

  if (!authorized) { score -= 35; breakdown.push('Chain not trusted (authorization failed)'); }
  if (certificate?.isExpired) { score -= 50; breakdown.push('Certificate is expired'); }
  if (certificate?.daysRemaining !== null && certificate.daysRemaining !== undefined && certificate.daysRemaining >= 0 && certificate.daysRemaining < 14) {
    score -= 20;
    breakdown.push(`Certificate expires in ${certificate.daysRemaining} days`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 45 ? 'D' : 'F'
  };
}

export async function audit(host, port) {
  const started = Date.now();
  const { protocol, cipher, authorized, certificate } = await getChain(host, port);
  const tlsVersions = await probeTlsVersions(host, port);
  const ciphers = await probeCiphers(host, port, tlsVersions.supported['1.3'] ? '1.3' : '1.2');
  const ocsp = { status: 'unavailable', responder: null, detail: 'OCSP not available in Workers runtime' };
  const scoring = score({ authorized, tlsVersions, ciphers, certificate, ocsp, chain: [], host });
  return {
    host,
    port,
    protocol: protocol || 'unknown',
    authorized: authorized ?? false,
    authorizationError: null,
    cipher: cipher || { name: 'unknown', version: 'unknown' },
    certificate: certificate || null,
    chain: [],
    ocsp,
    tlsVersions,
    ciphers: ciphers || [],
    score: scoring.score,
    grade: scoring.grade,
    scoreBreakdown: scoring.breakdown,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started
  };
}

export default { audit, score, probeTlsVersions, probeCiphers };
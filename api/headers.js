// api/headers.js — HTTP header checker with security score (Cloudflare Workers compatible)
// Replaced node:http/node:https with fetch()

import { api, ok, fail, CODES } from '../lib/http.js';
import { guardUrl } from '../lib/netguard.js';
import { schemas } from '../lib/schemas.js';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT = 10_000;

function securityScore(headers) {
  let score = 100;
  const checks = [];
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  const penalties = [
    ['strict-transport-security', 10, 'HSTS missing'],
    ['content-security-policy', 15, 'CSP missing'],
    ['x-content-type-options', 10, 'X-Content-Type-Options missing'],
    ['referrer-policy', 5, 'Referrer-Policy missing'],
    ['x-frame-options', 5, 'X-Frame-Options missing'],
    ['permissions-policy', 5, 'Permissions-Policy missing']
  ];
  for (const [name, p, why] of penalties) {
    if (!h[name]) { score -= p; checks.push({ ok: false, header: name, why }); }
    else checks.push({ ok: true, header: name });
  }
  return { score: Math.max(0, score), checks };
}

async function fetchHeaders(url, redirectCount = 0, chain = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'NetUtils-Bot/2.0', Accept: '*/*' },
    });

    clearTimeout(timeout);
    const step = { url, statusCode: res.status, headers: Object.fromEntries(res.headers.entries()) };
    chain.push(step);

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), url).toString();
      return fetchHeaders(next, redirectCount + 1, chain);
    }

    if (chain.length > MAX_REDIRECTS) {
      throw { code: 'BLOCKED_TARGET', message: `Redirect chain exceeds ${MAX_REDIRECTS} hops` };
    }

    const final = securityScore(Object.fromEntries(res.headers.entries()));
    return {
      url: chain[0].url,
      finalUrl: url,
      statusCode: res.status,
      statusMessage: res.statusText,
      httpVersion: 'HTTP/2',
      headers: Object.fromEntries(res.headers.entries()),
      redirectChain: chain.map(c => ({ url: c.url, statusCode: c.statusCode, location: null })),
      redirectCount: chain.length - 1,
      securityScore: final.score,
      securityChecks: final.checks,
      durationMs: 0
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.code) throw err;
    throw { code: 'UPSTREAM_ERROR', message: `Failed to fetch headers: ${err.message}` };
  }
}

async function handler(req, res, ctx) {
  const { data } = req.query;
  if (!data) return fail(res, CODES.BAD_REQUEST, 'URL parameter (data) is required', { requestId: ctx.requestId });
  let target;
  try {
    const guarded = await guardUrl(data.includes('://') ? data : `https://${data}`, { doubleResolve: true });
    target = `${guarded.protocol}//${guarded.host}${guarded.port !== 443 && guarded.port !== 80 ? ':' + guarded.port : ''}${guarded.path}`;
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }
  try {
    const result = await fetchHeaders(target, 0, []);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
    return ok(res, result, 'HTTP headers retrieved', { requestId: ctx.requestId });
  } catch (err) {
    if (err.code) return fail(res, err.code, err.message, { requestId: ctx.requestId });
    return fail(res, CODES.UPSTREAM_ERROR, `Failed to fetch headers: ${err.message}`, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 30, burst: 5, schema: schemas.headers });
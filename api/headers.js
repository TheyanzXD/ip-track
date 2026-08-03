// api/headers.js — HTTP header checker: SSRF-guarded redirect chain, security score (TODO 01)
import http from 'http';
import https from 'https';
import { api, ok, fail, CODES } from '../lib/http.js';
import { guardUrl, maxRedirects } from '../lib/netguard.js';
import { schemas } from '../lib/schemas.js';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT = 10_000;

function securityScore(headers) {
  let score = 100;
  const checks = [];
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)]));
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

function fetchHeaders(url, redirectCount = 0, chain = []) {
  return new Promise((resolve, reject) => {
    maxRedirects(chain, MAX_REDIRECTS);
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'HEAD',
      timeout: REQUEST_TIMEOUT,
      headers: { 'User-Agent': 'NetUtils-Bot/2.0', Accept: '*/*' }
    }, (response) => {
      const step = { url, statusCode: response.statusCode, headers: response.headers };
      chain.push(step);
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        return fetchHeaders(next, redirectCount + 1, chain).then(resolve).catch(reject);
      }
      response.resume();
      const final = securityScore(response.headers);
      resolve({
        url: chain[0].url,
        finalUrl: url,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        httpVersion: response.httpVersion,
        headers: response.headers,
        redirectChain: chain.map(c => ({ url: c.url, statusCode: c.statusCode, location: c.headers.location || null })),
        redirectCount: chain.length - 1,
        securityScore: final.score,
        securityChecks: final.checks,
        durationMs: Date.now() - started
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
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

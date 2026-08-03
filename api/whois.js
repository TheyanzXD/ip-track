// api/whois.js — RDAP-first WHOIS with raw fallback (TODO 01+02)
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget } from '../lib/netguard.js';
import { lookupDomain, lookupIp, lookupAsn } from '../lib/rdap.js';
import { schemas } from '../lib/schemas.js';

async function handler(req, res, ctx) {
  const { data } = req.query;
  if (!data) return fail(res, CODES.BAD_REQUEST, 'Domain or IP parameter (data) is required', { requestId: ctx.requestId });

  let parsed;
  try {
    parsed = parseTarget(data);
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }

  try {
    let result;
    if (parsed.type === 'domain') {
      const info = await lookupDomain(parsed.asciiHost);
      result = { target: parsed.asciiHost, kind: 'domain', ...info };
    } else if (parsed.type === 'ipv4' || parsed.type === 'ipv6') {
      const info = await lookupIp(parsed.value);
      result = { ...info, target: parsed.value };
    } else {
      return fail(res, CODES.INVALID_TARGET, 'Invalid target for WHOIS lookup', { requestId: ctx.requestId });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return ok(res, result, 'Registration data retrieved', { requestId: ctx.requestId });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, CODES.NOT_FOUND, err.message, { requestId: ctx.requestId });
    if (err.code === 'UNRESOLVABLE') return fail(res, CODES.NOT_FOUND, err.message, { requestId: ctx.requestId });
    return fail(res, err.code || CODES.UPSTREAM_ERROR, err.message || 'WHOIS lookup failed', { requestId: ctx.requestId });
  }
}

// ASN lookup convenience: /api/whois?data=AS15169
async function handlerAsn(req, res, ctx) {
  const { data } = req.query;
  if (!data || !/^AS\d+$/i.test(String(data))) return handler(req, res, ctx);
  try {
    const result = await lookupAsn(data);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return ok(res, result, 'ASN registration data retrieved', { requestId: ctx.requestId });
  } catch (err) {
    return fail(res, err.code || CODES.UPSTREAM_ERROR, err.message, { requestId: ctx.requestId });
  }
}

export default api(async (req, res, ctx) => {
  const { data } = req.query;
  if (data && /^AS\d+$/i.test(String(data))) return handlerAsn(req, res, ctx);
  return handler(req, res, ctx);
}, { limit: 20, burst: 4, schema: schemas.whois });

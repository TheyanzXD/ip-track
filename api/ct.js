// api/ct.js — Certificate Transparency + subdomain discovery (TODO 06)
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget } from '../lib/netguard.js';
import { lookupCt } from '../lib/ct.js';
import { schemas } from '../lib/schemas.js';

async function handler(req, res, ctx) {
  const { data } = req.query;
  if (!data) return fail(res, CODES.BAD_REQUEST, 'Domain parameter (data) is required', { requestId: ctx.requestId });
  let domain;
  try {
    const parsed = parseTarget(data);
    if (parsed.type !== 'domain') return fail(res, CODES.INVALID_TARGET, 'CT lookup requires a domain name', { requestId: ctx.requestId });
    domain = parsed.asciiHost;
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }
  try {
    const result = await lookupCt(domain);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return ok(res, result, 'Certificate transparency data retrieved', { requestId: ctx.requestId });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, CODES.NOT_FOUND, err.message, { requestId: ctx.requestId });
    return fail(res, err.code || CODES.UPSTREAM_ERROR, err.message, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 10, burst: 2, schema: schemas.ct });

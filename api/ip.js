// api/ip.js — IP intelligence: multi-provider failover, cache, SSRF guard (TODO 01+08)
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget, guardHost, guardIp } from '../lib/netguard.js';
import { lookupIp, reverseDns, isBlocked } from '../lib/ipintel.js';
import { schemas } from '../lib/schemas.js';

async function handler(req, res, ctx) {
  const { data } = req.query;
  const xff = req.headers['x-forwarded-for'];
  const visitorIp = xff ? xff.split(',')[0].trim() : req.socket?.remoteAddress?.replace(/^::ffff:/, '');
  const target = data || visitorIp;

  if (!target) return fail(res, CODES.BAD_REQUEST, 'No IP address available', { requestId: ctx.requestId });

  let resolved;
  try {
    const parsed = parseTarget(target);
    if (parsed.type === 'domain') {
      resolved = await guardHost(parsed.asciiHost, { doubleResolve: true });
    } else {
      guardIp(parsed.value);
      resolved = parsed.value;
    }
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }

  const isPrivate = isBlocked(resolved).blocked;
  try {
    const info = await lookupIp(resolved);
    const rdns = await reverseDns(resolved).catch(() => null);
    const payload = {
      ...info,
      queriedIp: data || null,
      reverseDns: rdns,
      private: isPrivate
    };
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return ok(res, payload, 'IP information retrieved', { requestId: ctx.requestId, cache: 'public, max-age=300, s-maxage=3600' });
  } catch (err) {
    if (err.code) return fail(res, err.code, err.message, { requestId: ctx.requestId });
    return fail(res, CODES.UPSTREAM_ERROR, err.message, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 30, burst: 5, schema: schemas.ip });

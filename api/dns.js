// api/dns.js — DNS v2: DoH multi-resolver, DNSSEC, resolver diff, homograph (TODO 01+05)
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget, isPunycode } from '../lib/netguard.js';
import { queryAllResolvers, resolverDiff, dnssecStatus, RECORD_TYPES } from '../lib/doh.js';
import { detectConfusables } from '../lib/homograph.js';
import { dnsCache } from '../lib/dnscache.js';
import { schemas } from '../lib/schemas.js';

async function handler(req, res, ctx) {
  const { data, type = 'ALL' } = req.query;
  if (!data) return fail(res, CODES.BAD_REQUEST, 'Domain parameter (data) is required', { requestId: ctx.requestId });

  let domain;
  try {
    const parsed = parseTarget(data);
    if (parsed.type !== 'domain') return fail(res, CODES.INVALID_TARGET, 'DNS lookup requires a domain name', { requestId: ctx.requestId });
    domain = parsed.asciiHost;
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }

  const requested = type.toUpperCase() === 'ALL' ? RECORD_TYPES : [type.toUpperCase()];
  const bad = requested.filter(t => !RECORD_TYPES.includes(t));
  if (bad.length) return fail(res, CODES.BAD_REQUEST, `Invalid record type(s): ${bad.join(', ')}. Valid: ${RECORD_TYPES.join(', ')}`, { requestId: ctx.requestId });

  try {
    const cacheKey = `dns:all:${requested.join(',')}:${domain}`;
    const cached = dnsCache.get(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
      return ok(res, cached, 'DNS records retrieved (cache)', { requestId: ctx.requestId, cache: 'public, max-age=60, s-maxage=600' });
    }

    const resolvers = {};
    for (const t of requested) {
      const per = await queryAllResolvers(t, domain);
      for (const [id, r] of Object.entries(per)) {
        if (!resolvers[id]) resolvers[id] = { provider: id, answers: {} };
        resolvers[id].answers[t] = r.records;
        if (r.flags) resolvers[id].flags = r.flags;
      }
    }

    const records = {};
    const diffInput = {};
    const dnssecInput = {};
    for (const [id, r] of Object.entries(resolvers)) {
      diffInput[id] = { type: requested[0], records: [] };
      dnssecInput[id] = { flags: r.flags || { ad: false }, rrsig: false, error: false };
      for (const t of requested) {
        const recs = r.answers[t] || [];
        if (recs.length > 0 && !records[t]) records[t] = recs;
      }
    }

    const diffs = [];
    for (const t of requested) {
      const per = {};
      for (const [id, r] of Object.entries(resolvers)) per[id] = { type: t, records: r.answers[t] || [] };
      diffs.push(...resolverDiff(per));
    }

    const confusables = detectConfusables(domain);
    const payload = {
      domain,
      resolvers: Object.fromEntries(Object.entries(resolvers).map(([id, r]) => [id, {
        provider: id,
        answers: r.answers,
        flags: r.flags || null,
        dnssec: r.flags ? { ad: r.flags.ad } : null
      }])),
      records,
      dnssec: dnssecStatus(dnssecInput),
      resolverDiff: diffs,
      flags: {
        homograph: confusables.suspicious,
        punycode: isPunycode(domain),
        suspicious: confusables.suspicious || isPunycode(domain)
      },
      errors: null
    };
    dnsCache.set(cacheKey, payload, 60_000);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
    return ok(res, payload, 'DNS records retrieved', { requestId: ctx.requestId });
  } catch (err) {
    return fail(res, err.code || CODES.UPSTREAM_ERROR, err.message || 'DNS lookup failed', { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 60, burst: 10, schema: schemas.dns });

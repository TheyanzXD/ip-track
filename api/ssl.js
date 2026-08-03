// api/ssl.js — SSL/TLS audit v2: chain, OCSP, cipher matrix, scoring (TODO 01+07)
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget } from '../lib/netguard.js';
import { audit } from '../lib/sslprobe.js';
import { schemas } from '../lib/schemas.js';

async function handler(req, res, ctx) {
  const { data, port = '443' } = req.query;
  if (!data) return fail(res, CODES.BAD_REQUEST, 'Domain parameter (data) is required', { requestId: ctx.requestId });

  let domain;
  try {
    const parsed = parseTarget(data);
    if (parsed.type === 'url') domain = parsed.asciiHost;
    else if (parsed.type === 'domain') domain = parsed.asciiHost;
    else return fail(res, CODES.INVALID_TARGET, 'SSL check requires a hostname', { requestId: ctx.requestId });
  } catch (err) {
    return fail(res, err.code, err.message, { requestId: ctx.requestId });
  }

  const targetPort = parseInt(port, 10);
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
    return fail(res, CODES.BAD_REQUEST, 'Invalid port number', { requestId: ctx.requestId });
  }
  if (![443, 8443, 465, 993, 995, 80].includes(targetPort)) {
    return fail(res, CODES.BLOCKED_TARGET, 'Port not in allowed set [80, 443, 465, 993, 995, 8443]', { requestId: ctx.requestId });
  }

  try {
    const result = await audit(domain, targetPort);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
    return ok(res, result, 'SSL/TLS audit completed', { requestId: ctx.requestId });
  } catch (err) {
    if (err.code) return fail(res, err.code, err.message, { requestId: ctx.requestId });
    return fail(res, CODES.UPSTREAM_ERROR, `SSL/TLS audit failed: ${err.message}`, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 30, burst: 5, schema: schemas.ssl });

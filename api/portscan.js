import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget, guardHost, guardIp, ERR } from '../lib/netguard.js';
import { scan, parsePorts } from '../lib/scanner.js';

async function resolveTarget(target, { doubleResolve = true } = {}) {
  const parsed = parseTarget(target);
  if (parsed.type === 'domain') return { host: parsed.asciiHost, ip: await guardHost(parsed.asciiHost, { doubleResolve }) };
  guardIp(parsed.value);
  return { host: parsed.value, ip: parsed.value };
}

async function handler(req, res, ctx) {
  const { data, ports: portsParam } = req.query;

  if (!data) return fail(res, CODES.BAD_REQUEST, 'Host parameter (data) is required', { requestId: ctx.requestId });

  let host, ip;
  try {
    ({ host, ip } = await resolveTarget(data));
  } catch (err) {
    if (err.code === ERR.REBINDING_DETECTED || err.code === ERR.BLOCKED_TARGET) {
      return fail(res, err.code, err.message, { requestId: ctx.requestId });
    }
    return fail(res, err.code || CODES.INVALID_TARGET, err.message, { requestId: ctx.requestId });
  }

  let ports;
  try {
    ports = parsePorts(portsParam);
  } catch (err) {
    return fail(res, CODES.BAD_REQUEST, err.message, { requestId: ctx.requestId });
  }

  try {
    const started = Date.now();
    const results = await scan(host, ports, { concurrency: 10 });
    
    res.setHeader('Cache-Control', 'no-store');
    return ok(res, {
      host,
      durationMs: Date.now() - started,
      open: results.filter(r => r.status === 'open').length,
      filtered: results.filter(r => r.status === 'filtered').length,
      closed: results.filter(r => r.status === 'closed').length,
      results: results.map(r => ({ port: r.port, status: r.status, service: r.service, banner: r.banner }))
    }, 'Port scan completed', { requestId: ctx.requestId });
  } catch (err) {
    return fail(res, CODES.INTERNAL_ERROR, 'Port scan failed: ' + err.message, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 10, burst: 2, schema: null });

// lib/http.js — shared handler wrapper: uniform errors, requestId, rate limit, schema check, cache headers
import { checkLimit, clientIp, requestId } from './ratelimit.js';
import { requestLog, error as logError, countError } from './logger.js';
import { validate } from './validator.js';

export const CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_TARGET: 'INVALID_TARGET',
  BLOCKED_TARGET: 'BLOCKED_TARGET',
  REBINDING_DETECTED: 'REBINDING_DETECTED',
  UNRESOLVABLE: 'UNRESOLVABLE',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED'
};

const CODE_STATUS = {
  BAD_REQUEST: 400,
  INVALID_TARGET: 400,
  BLOCKED_TARGET: 403,
  REBINDING_DETECTED: 403,
  UNRESOLVABLE: 404,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  SCHEMA_VIOLATION: 500,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  AI_UNAVAILABLE: 503,
  BUDGET_EXHAUSTED: 402
};

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
  return body;
}

export function ok(res, data, message = 'OK', { cache, requestId: rid } = {}) {
  const body = { status: 'success', message, data };
  if (cache) res.setHeader('Cache-Control', cache);
  if (rid) res.setHeader('X-Request-Id', rid);
  return json(res, 200, body);
}

export function fail(res, code, message, { status, requestId: rid, data } = {}) {
  const statusCode = status || CODE_STATUS[code] || 500;
  const body = { status: 'error', code, message, data: data ?? null };
  if (rid) res.setHeader('X-Request-Id', rid);
  return json(res, statusCode, body);
}

export function fromThrown(res, err, { requestId: rid } = {}) {
  if (err && err.code && CODES[err.code]) {
    return fail(res, err.code, err.message, { requestId: rid });
  }
  countError();
  logError('unhandled', { err: err?.stack || String(err) });
  return fail(res, CODES.INTERNAL_ERROR, 'Internal server error', { requestId: rid });
}

export function ratelimitHeaders(res, { limit, remaining, burst, retryAfter }) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retryAfter));
  }
}

export const NO_LIMIT = Symbol('no-limit');
export const EXEMPT_PATHS = new Set(['/api/health', '/api/metrics', '/api/share']);

// api(handler, opts) — opts: { limit, burst, schema, cache, exempt }
export function api(handler, opts = {}) {
  const { limit = 30, burst = 5, schema, cache, exempt = false } = opts;
  return async function wrapped(req, res) {
    const rid = requestId(req);
    res.setHeader('X-Request-Id', rid);
    const started = Date.now();
    const path = req.url.split('?')[0];

    if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }

    try {
      if (!exempt && !EXEMPT_PATHS.has(path)) {
        const ip = clientIp(req);
        const rl = await checkLimit(`${path}:${ip}`, { limit, burst });
        ratelimitHeaders(res, {
          limit,
          remaining: Math.max(0, limit - rl.count),
          burst,
          retryAfter: rl.retryAfter
        });
        if (!rl.allowed) {
          requestLog(req, { requestId: rid, durationMs: Date.now() - started, status: 429, endpoint: path });
          return fail(res, CODES.RATE_LIMITED, 'Too many requests. Please slow down and retry.', {
            status: 429, requestId: rid,
            data: { retryAfter: rl.retryAfter, limit, burst }
          });
        }
      }

      await handler(req, res, { requestId: rid });

      if (schema && !res.writableEnded) {
        const body = res.locals?.body;
        if (body) {
          const errors = validate(schema, body.data);
          if (errors.length) {
            countError();
            logError('schema_violation', { path, errors });
            if (process.env.NODE_ENV === 'development') throw new Error(`Schema violation: ${errors.join('; ')}`);
          }
        }
      }
    } catch (err) {
      if (!res.writableEnded) fromThrown(res, err, { requestId: rid });
    } finally {
      if (!res.writableEnded && !res.headersSent) requestLog(req, { requestId: rid, durationMs: Date.now() - started, status: res.statusCode, endpoint: path });
    }
  };
}

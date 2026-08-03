// lib/logger.js — structured JSON logs (TODO 20)
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function redact(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(api[_-]?key|token|secret|password|authorization)=([^&\s]+)/gi, '$1=[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1[REDACTED]');
  }
  return value;
}

function write(level, msg, fields) {
  if (LEVELS[level] < LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields
  };
  try {
    console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
  } catch {
    console.log(JSON.stringify({ level, msg }));
  }
}

export function debug(msg, fields = {}) { write('debug', msg, fields); }
export function info(msg, fields = {}) { write('info', msg, fields); }
export function warn(msg, fields = {}) { write('warn', msg, fields); }
export function error(msg, fields = {}) { write('error', msg, redact(fields)); }

export function requestLog(req, { requestId, durationMs, status, endpoint }) {
  write('info', 'request', {
    requestId,
    method: req.method,
    endpoint,
    path: req.url,
    status,
    durationMs,
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || undefined
  });
}

let errorCount = 0;
export function countError() { errorCount++; }
export function stats() { return { errorCount }; }

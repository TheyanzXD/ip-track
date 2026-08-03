// api/metrics.js — rate-limit stats, cache hit ratios, error count (TODO 20)
import { api, ok } from '../lib/http.js';
import { stats as rlStats } from '../lib/ratelimit.js';
import { stats as logStats } from '../lib/logger.js';
import { cacheStats } from '../lib/dnscache.js';
import { stats as scanStats } from '../lib/scanstore.js';
import { jobStats } from '../lib/jobs.js';
import { kvStats } from '../lib/kv.js';

async function handler(req, res, ctx) {
  const body = {
    ratelimit: rlStats(),
    errors: logStats(),
    caches: cacheStats(),
    scans: scanStats(),
    jobs: jobStats(),
    kv: kvStats(),
    at: new Date().toISOString()
  };
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, body, 'Metrics', { requestId: ctx.requestId });
}

export default api(handler, { exempt: true, schema: null });

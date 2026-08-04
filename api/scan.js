// api/scan.js — batch job engine: create, status, SSE stream (TODO 09+17)
import { api, ok, fail, CODES, json } from '../lib/http.js';
import { createJob, getJob, snapshot, subscribe, abortJob, jobStats } from '../lib/jobs.js';
import { webhookLog } from '../lib/webhooks.js';
import { schemas } from '../lib/schemas.js';
import { isBlocked } from '../lib/netguard.js';

async function handler(req, res, ctx) {
  const { jobId, stream, abort, webhooks } = req.query;

  if (jobId) {
    const job = getJob(String(jobId).slice(0, 64));
    if (!job) return fail(res, CODES.NOT_FOUND, 'Job not found or expired', { requestId: ctx.requestId });
    if (stream === '1') return streamJob(res, job, ctx);
    return ok(res, snapshot(job), 'Job status', { requestId: ctx.requestId });
  }
  if (abort) {
    const job = getJob(String(abort).slice(0, 64));
    if (!job) return fail(res, CODES.NOT_FOUND, 'Job not found or expired', { requestId: ctx.requestId });
    abortJob(job.jobId);
    return ok(res, snapshot(job), 'Job aborted', { requestId: ctx.requestId });
  }
  if (webhooks === '1') {
    return ok(res, webhookLog(), 'Webhook delivery log', { requestId: ctx.requestId });
  }

  // POST create
  if (req.method !== 'POST') return fail(res, CODES.BAD_REQUEST, 'POST required to create a job', { requestId: ctx.requestId });

  let body;
  try {
    body = await readJson(req, 128 * 1024);
  } catch (err) {
    return fail(res, CODES.BAD_REQUEST, `Invalid JSON body: ${err.message}`, { requestId: ctx.requestId });
  }
  const { tool, items, webhookUrl, webhookSecret } = body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, CODES.BAD_REQUEST, 'items[] is required (array of domains/IPs)', { requestId: ctx.requestId });
  }
  const clean = items.map(i => String(i).trim().toLowerCase()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (webhookUrl) {
    try {
      const u = new URL(webhookUrl);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('scheme');
      if (isBlocked(u.hostname).blocked && !['localhost', '127.0.0.1', '::1'].includes(u.hostname)) {
        return fail(res, CODES.BLOCKED_TARGET, 'Webhook URL resolves to non-public address', { requestId: ctx.requestId });
      }
    } catch {
      return fail(res, CODES.BAD_REQUEST, 'Invalid webhookUrl', { requestId: ctx.requestId });
    }
  }
  if (webhookSecret && String(webhookSecret).length < 8) {
    return fail(res, CODES.BAD_REQUEST, 'webhookSecret must be at least 8 characters', { requestId: ctx.requestId });
  }

  try {
    const job = createJob({ tool, items: clean, webhookUrl, webhookSecret });
    res.setHeader('Cache-Control', 'no-store');
    return ok(res, snapshot(job), 'Job created', { requestId: ctx.requestId });
  } catch (err) {
    return fail(res, err.code || CODES.BAD_REQUEST, err.message, { requestId: ctx.requestId });
  }
}

function streamJob(res, job, ctx) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.flushHeaders?.();
  const send = (event, payload) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  send('start', snapshot(job));
  const unsub = subscribe(job.jobId, (evt) => {
    if (evt.event === 'item') send('item', evt);
    if (evt.event === 'done') { send('done', snapshot(job)); res.end(); }
    if (evt.event === 'aborted') { send('aborted', snapshot(job)); res.end(); }
  });
  if (job.status === 'done' || job.status === 'failed' || job.status === 'partial' || job.status === 'aborted') {
    send('done', snapshot(job));
    res.end();
    return;
  }
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) send('progress', { done: job.done, total: job.total, etaSec: job.etaSec });
  }, 3000);
  res.on('close', () => { clearInterval(heartbeat); unsub(); });
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length || c.byteLength || 0;
      if (size > maxBytes) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const totalLength = chunks.reduce((sum, c) => sum + (c.length || c.byteLength || 0), 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          const len = c.length || c.byteLength || 0;
          combined.set(c instanceof Uint8Array ? c : new Uint8Array(c), offset);
          offset += len;
        }
        resolve(JSON.parse(new TextDecoder().decode(combined)));
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default api(handler, { limit: 5, burst: 2, schema: null });

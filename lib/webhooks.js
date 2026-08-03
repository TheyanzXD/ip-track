// lib/webhooks.js — HMAC-signed webhook dispatch with retry + event log (TODO 17)
import crypto from 'crypto';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 5000, 30_000];
const TIMEOUT_MS = 10_000;
const MAX_LOG = 50;

const log = [];

function signature(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export async function sendWebhook(job, attempt = 1) {
  const { webhookUrl, webhookSecret } = job;
  if (!webhookUrl) return;
  const payload = {
    event: 'scan.completed',
    scanId: job.jobId,
    tool: job.tool,
    query: null,
    status: job.status,
    timestamp: new Date().toISOString(),
    attempt,
    summary: { total: job.total, ok: job.ok, failed: job.failed },
    results: job.results.filter(Boolean).slice(0, 200)
  };
  const body = JSON.stringify(payload);
  const entry = { scanId: job.jobId, attempt, at: new Date().toISOString(), status: 'sending' };
  log.unshift(entry);
  if (log.length > MAX_LOG) log.pop();
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature(body, webhookSecret || '')}`,
        'X-Webhook-Event': 'scan.completed',
        'X-Webhook-Idempotency-Key': `${job.jobId}:${attempt}`
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    entry.status = res.ok ? 'delivered' : `failed:${res.status}`;
    entry.code = res.status;
    entry.latencyMs = entry.latencyMs ?? 0;
    job.webhookStatus = res.ok ? 'delivered' : 'failed';
    if (!res.ok && attempt < MAX_ATTEMPTS) {
      entry.status = 'retrying';
      job.webhookStatus = 'retrying';
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
      return sendWebhook(job, attempt + 1);
    }
  } catch (err) {
    entry.status = 'error';
    entry.error = err.message;
    if (attempt < MAX_ATTEMPTS) {
      entry.status = 'retrying';
      job.webhookStatus = 'retrying';
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
      return sendWebhook(job, attempt + 1);
    }
    job.webhookStatus = 'failed';
  }
  entry.endedAt = new Date().toISOString();
}

export function dispatchWebhook(job) {
  job.webhookStatus = 'queued';
  sendWebhook(job).catch(() => { job.webhookStatus = 'failed'; });
}

export function webhookLog() { return log; }

export function verifySignature(body, secret, providedSignature) {
  if (!providedSignature) return false;
  const expected = `sha256=${signature(body, secret)}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(providedSignature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default { sendWebhook, dispatchWebhook, webhookLog, verifySignature };

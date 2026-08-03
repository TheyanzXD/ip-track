// lib/webhooks.js — HMAC-signed webhook dispatch with retry + event log (TODO 17)
// Cloudflare Workers compatible: uses Web Crypto API instead of node:crypto

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 5000, 30_000];
const TIMEOUT_MS = 10_000;
const MAX_LOG = 50;

const log = [];

async function signature(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `sha256=${hex}`;
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
        'X-Webhook-Signature': await signature(body, webhookSecret || ''),
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

export async function verifySignature(body, secret, providedSignature) {
  if (!providedSignature) return false;
  const expected = await signature(body, secret);
  if (expected.length !== providedSignature.length) return false;
  let match = true;
  for (let i = 0; i < expected.length; i++) {
    if (expected.charCodeAt(i) !== providedSignature.charCodeAt(i)) {
      match = false;
      break;
    }
  }
  return match;
}

export default { sendWebhook, dispatchWebhook, webhookLog, verifySignature };

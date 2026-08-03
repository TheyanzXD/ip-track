// lib/jobs.js — batch scan job engine: queue, concurrency 5, pacing, retry, TTL (TODO 09)
import { randomUUID } from 'crypto';
import { lookupIp } from './ipintel.js';
import { queryAllResolvers, flattenRecords, RECORD_TYPES } from './doh.js';
import { audit } from './sslprobe.js';

const MAX_ITEMS = 200;
const CONCURRENCY = 5;
const JOB_TTL_MS = 15 * 60_000;
const MAX_RETRIES = 2;
const SWEEP_MS = 30_000;

export const jobs = new Map();
const queue = [];
let running = 0;

const sweeper = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) { jobs.delete(id); job.status = 'expired'; }
}, SWEEP_MS);
sweeper.unref?.();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function createJob({ tool, items, webhookUrl, webhookSecret }) {
  if (!items || items.length === 0) throw { code: 'BAD_REQUEST', message: 'No items provided' };
  if (items.length > MAX_ITEMS) throw { code: 'BAD_REQUEST', message: `Max ${MAX_ITEMS} items per job` };
  if (!['dns', 'ip', 'ssl'].includes(tool)) throw { code: 'BAD_REQUEST', message: 'Tool must be dns, ip, or ssl' };
  const jobId = randomUUID().slice(0, 12);
  const job = {
    jobId,
    tool,
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    total: items.length,
    done: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    results: new Array(items.length).fill(null),
    retries: new Map(),
    webhookUrl: webhookUrl || null,
    webhookSecret: webhookSecret || null,
    subscribers: new Set(),
    etaSec: null
  };
  jobs.set(jobId, job);
  queue.push({ jobId, items });
  pump();
  return job;
}

async function processItem(tool, item) {
  switch (tool) {
    case 'dns': {
      const out = {};
      for (const t of RECORD_TYPES) {
        const per = await queryAllResolvers(t, item, { cache: true });
        for (const [rid, r] of Object.entries(per)) if (!r.error && !out[t]) out[t] = r.records;
      }
      return { query: item, records: out };
    }
    case 'ip': {
      const info = await lookupIp(item);
      return { query: item, ip: info.ip, country: info.country, city: info.city, isp: info.isp, asn: info.asn, meta: info.meta };
    }
    case 'ssl': {
      const a = await audit(item, 443);
      return { query: item, score: a.score, grade: a.grade, issuer: a.certificate?.issuer?.CN || a.certificate?.issuer?.O || null, expiry: a.certificate?.validTo || null, protocol: a.protocol };
    }
    default:
      throw new Error(`Unknown tool ${tool}`);
  }
}

async function runItem(job, item, attempt = 0) {
  job.status = 'running';
  try {
    const result = await processItem(job.tool, item);
    job.results[job.done] = { item, status: 'ok', result };
    job.ok++;
    job.done++;
    emit(job, 'item', { index: job.done - 1, item, status: 'ok' });
  } catch (err) {
    const tries = (job.retries.get(item) || 0) + 1;
    job.retries.set(item, tries);
    if (tries <= MAX_RETRIES && (err.code !== 'BAD_REQUEST')) {
      await sleep(500 * tries);
      return runItem(job, item, tries);
    }
    job.results[job.done] = { item, status: 'error', error: err.message || String(err), code: err.code || 'ERROR' };
    job.failed++;
    job.done++;
    emit(job, 'item', { index: job.done - 1, item, status: 'error' });
  }
}

async function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const { jobId, items } = queue.shift();
    const job = jobs.get(jobId);
    if (!job) continue;
    running++;
    job.startedAt = job.startedAt || Date.now();
    job.status = 'running';
    emit(job, 'start', { jobId });
    const chunk = [...items];
    (async () => {
      const startedAt = Date.now();
      const doneBefore = 0;
      while (job.done < chunk.length) {
        const item = chunk[job.done];
        job.etaSec = Math.round(((Date.now() - startedAt) / Math.max(1, job.done)) * (chunk.length - job.done) / 1000);
        await runItem(job, item);
        await sleep(120); // pacing per-item
      }
      job.status = job.failed > 0 ? (job.ok > 0 ? 'partial' : 'failed') : 'done';
      job.finishedAt = Date.now();
      job.etaSec = null;
      emit(job, 'done', { status: job.status, ok: job.ok, failed: job.failed });
      running--;
      pump();
      if (job.webhookUrl) {
        const { dispatchWebhook } = await import('./webhooks.js');
        dispatchWebhook(job);
      }
    })();
  }
}

export function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (Date.now() - job.createdAt > JOB_TTL_MS && job.status !== 'running') {
    jobs.delete(jobId);
    return null;
  }
  return job;
}

export function snapshot(job) {
  return {
    jobId: job.jobId,
    tool: job.tool,
    status: job.status,
    total: job.total,
    done: job.done,
    ok: job.ok,
    failed: job.failed,
    skipped: job.skipped,
    etaSec: job.etaSec,
    createdAt: job.createdAt,
    results: job.results.filter(Boolean),
    webhook: job.webhookUrl ? { url: job.webhookUrl, status: job.webhookStatus || 'not_triggered' } : null
  };
}

export function subscribe(jobId, fn) {
  const job = jobs.get(jobId);
  if (!job) return () => {};
  job.subscribers.add(fn);
  return () => job.subscribers.delete(fn);
}

function emit(job, event, payload) {
  for (const fn of job.subscribers) {
    try { fn({ event, ...payload }); } catch { /* subscriber error */ }
  }
}

export function abortJob(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status === 'done' || job.status === 'failed') return false;
  job.status = 'aborted';
  emit(job, 'aborted', {});
  return true;
}

export function jobStats() {
  return { active: jobs.size, queued: queue.length, running };
}

export default { createJob, getJob, snapshot, subscribe, abortJob, jobStats, MAX_ITEMS };

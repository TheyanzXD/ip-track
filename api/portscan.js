// api/portscan.js — concurrent scanner + SSE streaming + status polling (TODO 04)
import { randomUUID } from 'crypto';
import { api, ok, fail, CODES } from '../lib/http.js';
import { parseTarget, guardHost, guardIp, ERR } from '../lib/netguard.js';
import { scan, parsePorts } from '../lib/scanner.js';
import { createScan, getScan, snapshot, stats } from '../lib/scanstore.js';

async function resolveTarget(target, { doubleResolve = true } = {}) {
  const parsed = parseTarget(target);
  if (parsed.type === 'domain') return { host: parsed.asciiHost, ip: await guardHost(parsed.asciiHost, { doubleResolve }) };
  guardIp(parsed.value);
  return { host: parsed.value, ip: parsed.value };
}

async function handler(req, res, ctx) {
  const { data, ports: portsParam, scanId, status, token, stream } = req.query;

  if (scanId) {
    const scan = getScan(String(scanId).slice(0, 64));
    if (!scan) return fail(res, CODES.NOT_FOUND, 'Scan not found or expired', { requestId: ctx.requestId });
    if (status === '1' || !stream) return ok(res, snapshot(scan), 'Scan status', { requestId: ctx.requestId });
    return streamScan(res, scan, ctx);
  }

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

  const scanIdNew = randomUUID().slice(0, 10);
  const scanEntry = createScan(scanIdNew, { host, ports, token: randomUUID().slice(0, 16) });

  if (stream === '1') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: start\ndata: ${JSON.stringify({ scanId: scanEntry.scanId, host, total: ports.length })}\n\n`);
    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);

    scanEntry.startTime = Date.now();
    scanEntry.status = 'running';
    const started = Date.now();
    const results = await scan(host, ports, {
      concurrency: 32,
      signal: controller.signal,
      onResult: (r) => {
        if (r.status === 'open') scanEntry.open++;
        else if (r.status === 'filtered') scanEntry.filtered++;
        else scanEntry.closed++;
        scanEntry.results.push(r);
        res.write(`event: result\ndata: ${JSON.stringify(r)}\n\n`);
        res.write(`event: progress\ndata: ${JSON.stringify({ done: scanEntry.results.length, total: ports.length, elapsedMs: Date.now() - started })}\n\n`);
      }
    });
    scanEntry.status = 'done';
    scanEntry.endTime = Date.now();
    clearInterval(heartbeat);
    res.write(`event: done\ndata: ${JSON.stringify({ scanId: scanEntry.scanId, durationMs: Date.now() - started, summary: { open: scanEntry.open, filtered: scanEntry.filtered, closed: scanEntry.closed } })}\n\n`);
    res.end();
    return;
  }

  // Non-streaming path
  try {
    const started = Date.now();
    scanEntry.startTime = started;
    scanEntry.status = 'running';
    const results = await scan(host, ports, { concurrency: 32 });
    scanEntry.status = 'done';
    scanEntry.endTime = Date.now();
    scanEntry.results = results;
    scanEntry.open = results.filter(r => r.status === 'open').length;
    scanEntry.filtered = results.filter(r => r.status === 'filtered').length;
    scanEntry.closed = results.filter(r => r.status === 'closed').length;
    res.setHeader('Cache-Control', 'no-store');
    return ok(res, {
      ...snapshot(scanEntry),
      scanId: scanEntry.scanId,
      durationMs: Date.now() - started,
      results: results.map(r => ({ port: r.port, status: r.status, service: r.service, banner: r.banner }))
    }, 'Port scan completed', { requestId: ctx.requestId });
  } catch (err) {
    scanEntry.status = 'aborted';
    return fail(res, CODES.INTERNAL_ERROR, 'Port scan failed: ' + err.message, { requestId: ctx.requestId });
  }
}

function streamScan(res, scan, ctx) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.flushHeaders?.();
  res.write(`event: start\ndata: ${JSON.stringify({ scanId: scan.scanId, host: scan.host, total: scan.ports.length, resumed: scan.status })}\n\n`);
  const timer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`event: progress\ndata: ${JSON.stringify({ done: scan.results.length, total: scan.ports.length })}\n\n`);
      if (scan.status === 'done' || scan.status === 'aborted') {
        clearInterval(timer);
        res.write(`event: done\ndata: ${JSON.stringify(snapshot(scan))}\n\n`);
        res.end();
      }
    }
  }, 1500);
  const close = () => clearInterval(timer);
  res.on('close', close);
}

export default api(handler, { limit: 10, burst: 2, schema: null });

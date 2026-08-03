// api/ai.js — AI diagnostic report generator with SSE streaming (TODO 16)
import { api, ok, fail, CODES } from '../lib/http.js';
import { generate, aiStatus } from '../lib/ai.js';

async function handler(req, res, ctx) {
  const { tool = 'ip', data, stream } = req.query;
  const validTools = ['ip', 'dns', 'ssl', 'portscan', 'headers', 'whois', 'ct'];
  if (!validTools.includes(tool)) {
    return fail(res, CODES.BAD_REQUEST, `tool must be one of: ${validTools.join(', ')}`, { requestId: ctx.requestId });
  }
  if (!data) return fail(res, CODES.BAD_REQUEST, 'data parameter (JSON string) is required', { requestId: ctx.requestId });

  let payload;
  try {
    payload = JSON.parse(data.slice(0, 20_000));
  } catch {
    return fail(res, CODES.BAD_REQUEST, 'data must be a JSON string', { requestId: ctx.requestId });
  }

  const status = await aiStatus();
  if (!status.configured) {
    return fail(res, CODES.AI_UNAVAILABLE, 'AI analysis is not configured on this deployment', {
      requestId: ctx.requestId, data: status
    });
  }
  if (status.budget.exhausted) {
    return fail(res, CODES.BUDGET_EXHAUSTED, status.budget.exhausted ? `Daily AI budget ($${status.budget.dailyUsd}) exhausted` : '', {
      requestId: ctx.requestId, data: status
    });
  }

  try {
    if (stream === '1') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.flushHeaders?.();
      const { text, cached } = await generate(tool, payload, {
        stream: (token) => {
          if (!res.writableEnded) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      });
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, cached, model: status.model })}\n\n`);
        res.end();
      }
      return;
    }
    const { text, cached } = await generate(tool, payload);
    return ok(res, { summary: text, model: status.model, cached, tool }, 'AI diagnostic report generated', { requestId: ctx.requestId });
  } catch (err) {
    if (err.code) return fail(res, err.code, err.message, { requestId: ctx.requestId });
    return fail(res, CODES.UPSTREAM_ERROR, `AI generation failed: ${err.message}`, { requestId: ctx.requestId });
  }
}

export default api(handler, { limit: 5, burst: 1, schema: null });

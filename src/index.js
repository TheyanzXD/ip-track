// src/index.js — NetUtils - Network Diagnostic Toolkit Entry Point
// Cloudflare Workers compatible (nodejs_compat flag)

import { api, ok, fail, CODES } from './lib/http.js';

const apiHandlers = {
  '/api/ip': () => import('./api/ip.js').then(m => m.default),
  '/api/dns': () => import('./api/dns.js').then(m => m.default),
  '/api/headers': () => import('./api/headers.js').then(m => m.default),
  '/api/portscan': () => import('./api/portscan.js').then(m => m.default),
  '/api/ssl': () => import('./api/ssl.js').then(m => m.default),
  '/api/whois': () => import('./api/whois.js').then(m => m.default),
  '/api/ct': () => import('./api/ct.js').then(m => m.default),
  '/api/scan': () => import('./api/scan.js').then(m => m.default),
  '/api/share': () => import('./api/share.js').then(m => m.default),
  '/api/ai': () => import('./api/ai.js').then(m => m.default),
};

function createResponseWrapper(originalRequest) {
  let statusCode = 200;
  const headers = new Map();

  return {
    setHeader(name, value) {
      headers.set(name, value);
      return value;
    },
    get headers() {
      return originalRequest.headers;
    },
    get writableEnded() {
      return false;
    },
    get statusCode() {
      return statusCode;
    },
    set statusCode(v) {
      statusCode = v;
    },
    get headersSent() {
      return false;
    },
    end(body) {
      const responseHeaders = {};
      for (const [k, v] of headers.entries()) {
        responseHeaders[k] = v;
      }
      return new Response(body, { status: statusCode, headers: responseHeaders });
    },
    writeHead(status, headersArg) {
      statusCode = status;
      if (headersArg) {
        for (const [k, v] of Object.entries(headersArg)) {
          headers.set(k, v);
        }
      }
      return this;
    },
  };
}

function generateRequestId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    const req = {
      method,
      url: request.url,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(request.headers.entries()),
      socket: { remoteAddress: request.headers.get('cf-connecting-ip') || '' },
    };

    const res = createResponseWrapper(req);

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (path.startsWith('/api/')) {
      const handlerLoader = apiHandlers[path];
      if (!handlerLoader) {
        return new Response(JSON.stringify({ status: 'error', message: `Endpoint ${path} not found` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        const handler = await handlerLoader();
        return await handler(req, res, { requestId: generateRequestId() });
      } catch (err) {
        console.error(`[${path}] Error:`, err);
        return new Response(
          JSON.stringify({
            status: 'error',
            message: err.message || 'Internal server error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(null, { status: 404 });
  },
};

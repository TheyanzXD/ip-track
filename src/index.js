import { api, ok, fail, CODES } from '../lib/http.js';
import ipHandler from '../api/ip.js';
import dnsHandler from '../api/dns.js';
import headersHandler from '../api/headers.js';
import portscanHandler from '../api/portscan.js';
import sslHandler from '../api/ssl.js';
import whoisHandler from '../api/whois.js';
import ctHandler from '../api/ct.js';
import scanHandler from '../api/scan.js';
import shareHandler from '../api/share.js';
import aiHandler from '../api/ai.js';

const apiHandlers = {
  '/api/ip': ipHandler,
  '/api/dns': dnsHandler,
  '/api/headers': headersHandler,
  '/api/portscan': portscanHandler,
  '/api/ssl': sslHandler,
  '/api/whois': whoisHandler,
  '/api/ct': ctHandler,
  '/api/scan': scanHandler,
  '/api/share': shareHandler,
  '/api/ai': aiHandler,
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
      const handler = apiHandlers[path];
      if (!handler) {
        return new Response(JSON.stringify({ status: 'error', message: `Endpoint ${path} not found` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        let reqId;
        try { reqId = crypto.randomUUID(); } catch (e) { reqId = 'req-' + Date.now(); }
        return await handler(req, res, { requestId: reqId });
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

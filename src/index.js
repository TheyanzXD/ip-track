// src/index.js
// NetUtils - Network Diagnostic Toolkit Entry Point

import { createServer } from 'node:http';
import { parse } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

// API route handlers mapping
// Each handler corresponds to an endpoint in /api/
const apiHandlers = {
  '/api/ip': () => import('../api/ip.js').then(m => m.default),
  '/api/dns': () => import('../api/dns.js').then(m => m.default),
  '/api/headers': () => import('../api/headers.js').then(m => m.default),
  '/api/portscan': () => import('../api/portscan.js').then(m => m.default),
  '/api/ssl': () => import('../api/ssl.js').then(m => m.default),
  '/api/whois': () => import('../api/whois.js').then(m => m.default),
  '/api/ct': () => import('../api/ct.js').then(m => m.default),
  '/api/scan': () => import('../api/scan.js').then(m => m.default),
  '/api/share': () => import('../api/share.js').then(m => m.default),
  '/api/ai': () => import('../api/ai.js').then(m => m.default),
};

// Serve static files from /public
async function serveStatic(req, res, pathname) {
  try {
    const filePath = join(__dirname, '../public', pathname === '/' ? 'index.html' : pathname);
    const data = await readFile(filePath);
    const ext = pathname.split('.').pop() || 'html';
    const mimeTypes = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      webmanifest: 'application/manifest+json',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Not found' }));
  }
}

// Main request handler
async function handleRequest(req, res) {
  const { pathname, query } = parse(req.url || '/', true);
  const method = req.method || 'GET';

  // CORS headers (mirroring vercel.json)[reference:2]
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes: /api/*
  if (pathname.startsWith('/api/')) {
    const handlerLoader = apiHandlers[pathname];
    if (!handlerLoader) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: `Endpoint ${pathname} not found` }));
      return;
    }

    try {
      const handler = await handlerLoader();
      // Each handler receives (req, res) and should produce a JSON response
      // with shape { status, message, data }[reference:3][reference:4]
      await handler(req, res);
    } catch (err) {
      console.error(`[${pathname}] Error:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        message: isDev ? err.message : 'Internal server error',
      }));
    }
    return;
  }

  // Static files (UI)
  await serveStatic(req, res, pathname);
}

// Create HTTP server
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`🚀 NetUtils running at http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at /api/*`);
  if (isDev) console.log(`⚡ Development mode enabled`);
});

export default server;

import http from 'http';
import https from 'https';

const MAX_REDIRECTS = 5;

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

function normalizeUrl(url) {
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function fetchHeaders(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) { reject(new Error('Too many redirects')); return; }

    const mod = url.startsWith('https') ? https : http;
    const parsedUrl = new URL(url);

    const req = mod.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (url.startsWith('https') ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'HEAD',
      timeout: 10000,
      headers: { 'User-Agent': 'NetUtils-Bot/1.0' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return fetchHeaders(normalizeUrl(response.headers.location), redirectCount + 1).then(resolve).catch(reject);
      }
      resolve({
        url, finalUrl: url, statusCode: response.statusCode,
        statusMessage: response.statusMessage, httpVersion: response.httpVersion,
        headers: response.headers, redirectCount
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { data: target } = req.query;
  if (!target) return send(res, 400, 'error', 'URL parameter (data) is required', null);

  try {
    const result = await fetchHeaders(normalizeUrl(target));
    return send(res, 200, 'success', 'HTTP headers retrieved', result);
  } catch (error) {
    return send(res, 500, 'error', 'Failed to fetch headers: ' + error.message, null);
  }
}

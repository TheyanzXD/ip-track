// api/share.js — shareable result links (short codes) + OG preview (TODO 11)
import crypto from 'crypto';
import { api, ok, fail, CODES, json } from '../lib/http.js';
import { kvGet, kvSet, kvDel } from '../lib/kv.js';

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)
const TTL_DAYS = 7;
const MAX_PAYLOAD = 8 * 1024;

function randomCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let code = '';
  for (let i = 0; i < len; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

function ownerToken(code) {
  const secret = process.env.SHARE_SECRET || 'netutils-share';
  return crypto.createHmac('sha256', secret).update(code).digest('hex').slice(0, 24);
}

async function handler(req, res, ctx) {
  const { code } = req.query;

  if (req.method === 'POST') {
    let body;
    try { body = await readJson(req, MAX_PAYLOAD); } catch (err) {
      return fail(res, CODES.BAD_REQUEST, `Invalid body: ${err.message}`, { requestId: ctx.requestId });
    }
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object') {
      return fail(res, CODES.BAD_REQUEST, 'payload object is required', { requestId: ctx.requestId });
    }
    if (!payload.tool || !payload.query || !payload.result) {
      return fail(res, CODES.BAD_REQUEST, 'payload requires tool, query, result', { requestId: ctx.requestId });
    }
    const size = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (size > MAX_PAYLOAD) return fail(res, CODES.BAD_REQUEST, `Payload exceeds ${MAX_PAYLOAD} bytes`, { requestId: ctx.requestId });

    const newCode = randomCode();
    const record = {
      version: 1,
      payload,
      fingerprintHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16),
      createdAt: new Date().toISOString()
    };
    await kvSet(`share:${newCode}`, record, TTL_DAYS * 86400);
    const host = req.headers.host || 'localhost';
    return ok(res, {
      code: newCode,
      url: `${req.headers['x-forwarded-proto'] === 'https' || host !== 'localhost' ? 'https' : 'http'}://${host}/#/share/${newCode}`,
      expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000).toISOString()
    }, 'Share link created', { requestId: ctx.requestId });
  }

  if (req.method === 'DELETE') {
    if (!code) return fail(res, CODES.BAD_REQUEST, 'code parameter required', { requestId: ctx.requestId });
    const clean = String(code).toUpperCase().slice(0, 16);
    const provided = req.query.token || req.headers['x-owner-token'];
    if (provided !== ownerToken(clean)) {
      return fail(res, CODES.BAD_REQUEST, 'Invalid owner token', { requestId: ctx.requestId });
    }
    await kvDel(`share:${clean}`);
    return ok(res, { deleted: true, code: clean }, 'Share link deleted', { requestId: ctx.requestId });
  }

  // GET
  if (!code) return fail(res, CODES.BAD_REQUEST, 'code parameter required', { requestId: ctx.requestId });
  const clean = String(code).toUpperCase().slice(0, 16);
  const record = await kvGet(`share:${clean}`);
  if (!record) return fail(res, CODES.NOT_FOUND, 'Share link not found or expired', { requestId: ctx.requestId });
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return ok(res, { ...record, ownerToken: ownerToken(clean) }, 'Share payload', { requestId: ctx.requestId });
}

// GET /api/og?code=... handled by api/og.js (SVG preview)

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
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

export default api(handler, { limit: 30, burst: 10, exempt: true, schema: null });

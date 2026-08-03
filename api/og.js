// api/og.js — SVG preview card for share links (TODO 11)
import { kvGet } from '../lib/kv.js';

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function statFor(p) {
  const r = p?.result || {};
  if (r.score !== undefined && r.score !== null) return `Security score: ${r.score}/100 (${r.grade || ''})`;
  if (r.open !== undefined) return `Open ports: ${r.open} · Filtered: ${r.filtered ?? 0} · Closed: ${r.closed ?? 0}`;
  if (r.records) return `Record types: ${Object.keys(r.records).join(', ')}`;
  if (r.country) return `${r.country}${r.city ? ', ' + r.city : ''} · ${r.isp || 'unknown ISP'}`;
  if (r.subdomains) return `${r.subdomains.length} subdomains discovered`;
  return 'Network diagnostic result';
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').toUpperCase().slice(0, 16);
  const record = code ? await kvGet(`share:${code}`) : null;
  const p = record?.payload;
  const title = p ? `${p.tool} · ${p.query}` : 'NetUtils share link';
  const stat = p ? statFor(p) : 'Open this link to view the result';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0F0F0E"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="#1A1A18" stroke="#2E2E2A"/>
  <text x="100" y="160" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#635BFF">NetUtils</text>
  <text x="100" y="260" font-family="Arial, sans-serif" font-size="60" font-weight="700" fill="#F5F4F0">${escapeXml(title.slice(0, 58))}</text>
  <text x="100" y="360" font-family="Arial, sans-serif" font-size="36" fill="#9CA3AF">${escapeXml(stat.slice(0, 90))}</text>
  <text x="100" y="470" font-family="Arial, sans-serif" font-size="26" fill="#706F68">Shared via NetUtils · expires after 7 days</text>
</svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.end(svg);
}

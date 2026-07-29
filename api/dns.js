import dns from 'dns';
import { promisify } from 'util';

const resolveA = promisify(dns.resolve4);
const resolveAAAA = promisify(dns.resolve6);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const resolveNs = promisify(dns.resolveNs);
const resolveCname = promisify(dns.resolveCname);
const resolveSoa = promisify(dns.resolveSoa);
const resolveSrv = promisify(dns.resolveSrv);

const RECORD_TYPES = {
  A: resolveA, AAAA: resolveAAAA, MX: resolveMx,
  TXT: resolveTxt, NS: resolveNs, CNAME: resolveCname,
  SOA: resolveSoa, SRV: resolveSrv
};

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

function isDomainValid(domain) {
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { data: domain, type = 'ALL' } = req.query;
  if (!domain) return send(res, 400, 'error', 'Domain parameter (data) is required', null);

  const cleanDomain = domain.trim().toLowerCase();
  if (!isDomainValid(cleanDomain)) return send(res, 400, 'error', 'Invalid domain format', null);

  try {
    const types = type.toUpperCase() === 'ALL'
      ? Object.keys(RECORD_TYPES)
      : [type.toUpperCase()];

    const invalidTypes = types.filter(t => !RECORD_TYPES[t]);
    if (invalidTypes.length > 0)
      return send(res, 400, 'error', `Invalid record type(s): ${invalidTypes.join(', ')}. Valid: ${Object.keys(RECORD_TYPES).join(', ')}`, null);

    const records = {};
    const errors = {};

    for (const t of types) {
      try {
        records[t] = await RECORD_TYPES[t](cleanDomain);
      } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') records[t] = null;
        else errors[t] = err.message;
      }
    }

    return send(res, 200, 'success', 'DNS records retrieved', {
      domain: cleanDomain, records, errors: Object.keys(errors).length > 0 ? errors : null
    });
  } catch (error) {
    return send(res, 500, 'error', 'DNS lookup failed: ' + error.message, null);
  }
}

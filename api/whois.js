import whois from 'whois-json';

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

function isDomainValid(domain) {
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { data: domain } = req.query;

  if (!domain) {
    return send(res, 400, 'error', 'Domain parameter (data) is required', null);
  }

  const cleanDomain = domain.trim().toLowerCase();

  if (!isDomainValid(cleanDomain)) {
    return send(res, 400, 'error', 'Invalid domain format', null);
  }

  try {
    const result = await whois(cleanDomain, { timeout: 15000 });

    if (!result || Object.keys(result).length === 0) {
      return send(res, 404, 'error', 'No WHOIS data found for this domain', null);
    }

    const parsed = {};
    for (const [key, value] of Object.entries(result)) {
      if (value && value !== '') {
        parsed[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    return send(res, 200, 'success', 'WHOIS data retrieved', {
      domain: cleanDomain,
      whois: parsed,
      raw: null
    });
  } catch (error) {
    return send(res, 500, 'error', 'WHOIS lookup failed: ' + error.message, null);
  }
}

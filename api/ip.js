const IP_API_URL = 'http://ip-api.com/json';

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { data } = req.query;
    const visitorIp = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.socket.remoteAddress;
    const targetIp = data || visitorIp;

    const response = await fetch(`${IP_API_URL}/${targetIp}?fields=status,message,country,regionName,city,isp,org,as,timezone,lat,lon,query,mobile,proxy,hosting`);
    const result = await response.json();

    if (result.status === 'fail') {
      return send(res, 400, 'error', result.message || 'Invalid IP address or domain', null);
    }

    return send(res, 200, 'success', 'IP information retrieved', {
      ip: result.query,
      country: result.country,
      region: result.regionName,
      city: result.city,
      isp: result.isp,
      organization: result.org,
      asn: result.as,
      timezone: result.timezone,
      latitude: result.lat,
      longitude: result.lon,
      mobile: result.mobile || false,
      proxy: result.proxy || false,
      hosting: result.hosting || false,
      queriedIp: data || null
    });
  } catch (error) {
    return send(res, 500, 'error', 'Failed to fetch IP information. Please try again later.', null);
  }
}

import net from 'net';

const DEFAULT_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 8080, 8443];
const MAX_PORTS = 50;
const CONNECTION_TIMEOUT = 3000;
const COMMON_SERVICES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS',
  587: 'SMTP Submission', 993: 'IMAPS', 995: 'POP3S',
  3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL',
  6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 27017: 'MongoDB'
};

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

function isValidHost(host) {
  if (net.isIPv6(host)) return true;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(host)) return host.split('.').map(Number).every(p => p >= 0 && p <= 255);
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(host);
}

function scanPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(CONNECTION_TIMEOUT);
    socket.on('connect', () => { socket.destroy(); resolve({ port, status: 'open' }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ port, status: 'filtered' }); });
    socket.on('error', () => { socket.destroy(); resolve({ port, status: 'closed' }); });
    socket.connect(port, host);
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { data: host, ports: portsParam } = req.query;
  if (!host) return send(res, 400, 'error', 'Host parameter (data) is required', null);

  const cleanHost = host.trim();
  if (!isValidHost(cleanHost)) return send(res, 400, 'error', 'Invalid hostname or IP address', null);

  let ports = DEFAULT_PORTS;
  if (portsParam) {
    const customPorts = portsParam.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0 && p <= 65535);
    if (customPorts.length === 0) return send(res, 400, 'error', 'Invalid port(s). Use comma-separated numbers (1-65535)', null);
    ports = customPorts;
  }

  if (ports.length > MAX_PORTS) return send(res, 400, 'error', `Maximum ${MAX_PORTS} ports allowed`, null);

  try {
    const results = await Promise.all(ports.map(p => scanPort(cleanHost, p)));
    const enriched = results.map(r => ({ ...r, service: COMMON_SERVICES[r.port] || 'unknown' }));
    return send(res, 200, 'success', 'Port scan completed', {
      host: cleanHost, totalScanned: ports.length,
      open: results.filter(r => r.status === 'open').length,
      filtered: results.filter(r => r.status === 'filtered').length,
      closed: results.filter(r => r.status === 'closed').length,
      results: enriched
    });
  } catch (error) {
    return send(res, 500, 'error', 'Port scan failed: ' + error.message, null);
  }
}

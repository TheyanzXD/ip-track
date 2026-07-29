import tls from 'tls';

function send(res, statusCode, status, message, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json({ status, message, data });
}

function isDomainValid(domain) {
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain);
}

function getSSLInfo(host, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate(true);
      const info = {
        host, port, authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        protocol: socket.getProtocol(),
        cipher: { name: socket.getCipher().name, version: socket.getCipher().version },
        certificate: {
          subject: cert.subject, issuer: cert.issuer,
          validFrom: cert.valid_from, validTo: cert.valid_to,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint, fingerprint256: cert.fingerprint256,
          subjectaltname: cert.subjectaltname ? cert.subjectaltname.split(', ').filter(Boolean) : [],
          daysRemaining: cert.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null,
          isExpired: cert.valid_to ? new Date(cert.valid_to) < new Date() : null
        }
      };
      socket.end();
      resolve(info);
    });

    socket.on('error', (err) => reject(new Error('SSL/TLS connection failed: ' + err.message)));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('SSL/TLS connection timed out')); });
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { data: domain, port = '443' } = req.query;
  if (!domain) return send(res, 400, 'error', 'Domain parameter (data) is required', null);

  const cleanDomain = domain.trim().toLowerCase();
  if (!isDomainValid(cleanDomain)) return send(res, 400, 'error', 'Invalid domain format', null);

  const targetPort = parseInt(port, 10);
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535)
    return send(res, 400, 'error', 'Invalid port number', null);

  try {
    const info = await getSSLInfo(cleanDomain, targetPort);
    return send(res, 200, 'success', 'SSL/TLS certificate information retrieved', info);
  } catch (error) {
    return send(res, 500, 'error', error.message, null);
  }
}

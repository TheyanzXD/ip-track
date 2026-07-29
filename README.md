<p align="center">
  <img src="https://img.shields.io/badge/status-live-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/node-%3E%3D18-blue?style=for-the-badge&logo=node.js" alt="Node">
  <img src="https://img.shields.io/badge/vercel-deployed-000?style=for-the-badge&logo=vercel" alt="Vercel">
  <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License">
</p>

<div align="center">
  <h1>🌐 NetUtils</h1>
  <h3>⚡ Network Diagnostic Toolkit — Zero Dependencies ⚡</h3>
  <p>
    <strong>IP Geolocation · DNS Lookup · HTTP Headers · Port Scanner · SSL/TLS Checker</strong>
  </p>
  <p>
    <a href="#-features">Features</a> •
    <a href="#-api-endpoints">API</a> •
    <a href="#-deploy">Deploy</a> •
    <a href="#-project-structure">Structure</a>
  </p>
</div>

---

## ✨ Features

| # | Tool | Description | API Endpoint |
|---|------|-------------|--------------|
| 🌐 | **IP Info** | Geolocation, ISP, ASN, proxy/VPN detection | `GET /api/ip` |
| 📡 | **DNS Lookup** | A, AAAA, MX, TXT, NS, CNAME, SOA, SRV | `GET /api/dns` |
| 📋 | **HTTP Headers** | Response header analysis, redirect tracking | `GET /api/headers` |
| 🔌 | **Port Scanner** | TCP scan (50 ports max, 3s timeout) | `GET /api/portscan` |
| 🔒 | **SSL Checker** | Certificate details, expiry, cipher info | `GET /api/ssl` |

## 🚀 Deploy

<table>
<tr>
<td width="50%">

### Vercel CLI
```bash
npm i -g vercel
vercel login
vercel
# Framework: Other
```

</td>
<td width="50%">

### GitHub Import
1. Push to GitHub
2. [vercel.com/new](https://vercel.com/new)
3. Import repo
4. Framework: **Other**
5. Deploy ✓

</td>
</tr>
</table>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/yourusername/network-utils">
    <img src="https://vercel.com/button" alt="Deploy to Vercel">
  </a>
</p>

## 📡 API Endpoints

All endpoints: `GET /api/{feature}?data={value}` — JSON response `{ status, message, data }`.

### `GET /api/ip`
```
/api/ip          → your IP info
/api/ip?data=8.8.8.8  → lookup specific IP
```
<details>
<summary>📦 Response</summary>

```json
{
  "status": "success",
  "message": "IP information retrieved",
  "data": {
    "ip": "8.8.8.8",
    "country": "United States",
    "region": "California",
    "city": "Mountain View",
    "isp": "Google LLC",
    "asn": "AS15169",
    "timezone": "America/Los_Angeles",
    "latitude": 37.4056,
    "longitude": -122.0775,
    "proxy": false,
    "hosting": true
  }
}
```
</details>

### `GET /api/dns`
```
/api/dns?data=example.com          → all records
/api/dns?data=example.com&type=MX  → MX only
```
<details>
<summary>📦 Response</summary>

```json
{
  "status": "success",
  "message": "DNS records retrieved",
  "data": {
    "domain": "example.com",
    "records": {
      "A": ["93.184.216.34"],
      "MX": [{ "exchange": "mail.example.com", "priority": 10 }]
    }
  }
}
```
</details>

### `GET /api/headers`
```
/api/headers?data=https://example.com
```

### `GET /api/portscan`
```
/api/portscan?data=example.com
/api/portscan?data=example.com&ports=80,443,8080
```

### `GET /api/ssl`
```
/api/ssl?data=google.com
/api/ssl?data=google.com&port=443
```

> 📖 Full interactive docs at [`/docs`](https://your-domain.vercel.app/docs)

## 📁 Project Structure

```
📦 network-utils
├── 📄 index.html          # Main application
├── 📄 docs.html           # API documentation
├── 🎨 css/style.css       # Dark theme styles
├── ⚡ js/main.js          # Frontend logic
├── 🖥️ api/
│   ├── ip.js              # IP geolocation
│   ├── dns.js             # DNS records
│   ├── headers.js         # HTTP headers
│   ├── portscan.js        # Port scanner
│   └── ssl.js             # SSL/TLS checker
├── 📦 package.json        # Zero deps
├── ⚙️ vercel.json         # Vercel config
└── 📖 README.md           # This file
```

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Vercel Edge     │────▶│  Serverless     │
│  (static)   │     │  (CDN + CORS)    │     │  Functions      │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
              ┌───────────────────────────────────────┼────────┐
              │  Built-in Node.js Modules             │        │
              │  ┌─────┐ ┌────┐ ┌──────┐ ┌───┐ ┌───┐ │        │
              │  │ dns │ │net │ │ tls  │ │http│ │tls│ │        │
              │  └─────┘ └────┘ └──────┘ └───┘ └───┘ │        │
              └───────────────────────────────────────┘────────┘
```

## ⚖️ Legal

> **IP Grabber:** Shows your own IP or domains you own. Not for tracking without consent.  
> **Port Scanner:** Only scan systems you own or have written permission to test.  
> **Privacy:** Zero data stored. Everything processed in-memory, discarded after response.

---

<p align="center">
  Made with ❤️ for network diagnostics · <a href="https://github.com/yourusername/network-utils">GitHub</a>
</p>

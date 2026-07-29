<div align="center">

# 🌐 NetUtils

### ⚡ Network Diagnostic Toolkit — Zero Dependencies ⚡

**IP Geolocation · DNS Lookup · HTTP Headers · Port Scanner · SSL/TLS Checker**

<p>
  <img src="https://img.shields.io/badge/status-live-brightgreen?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/deploy-vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License" />
</p>

<p>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/github/stars/TheyanzXD/ip-track?style=flat-square&color=yellow" alt="Stars" />
  <img src="https://img.shields.io/github/last-commit/TheyanzXD/ip-track?style=flat-square" alt="Last Commit" />
  <img src="https://img.shields.io/github/languages/top/TheyanzXD/ip-track?style=flat-square" alt="Top Language" />
</p>

**[Features](#-features) · [Getting Started](#-getting-started) · [API Reference](#-api-endpoints) · [Deploy](#-deploy) · [Structure](#-project-structure) · [Contributing](#-contributing)**

</div>

<br>

## 📖 Overview

**NetUtils** is a lightweight, serverless network diagnostic toolkit built entirely on **native Node.js modules** — no third-party dependencies required. It bundles five essential networking tools behind a clean web UI and a simple JSON API, and deploys to [Vercel](https://vercel.com) in minutes.

> [!TIP]
> Every endpoint returns a consistent `{ status, message, data }` JSON shape, so it's easy to script against or plug into your own dashboard.

<br>

## ✨ Features

| | Tool | Description | Endpoint |
|:---:|:---|:---|:---|
| 🌐 | **IP Info** | Geolocation, ISP, ASN, proxy/VPN detection | `GET /api/ip` |
| 📡 | **DNS Lookup** | A, AAAA, MX, TXT, NS, CNAME, SOA, SRV records | `GET /api/dns` |
| 📋 | **HTTP Headers** | Response header analysis, redirect tracking | `GET /api/headers` |
| 🔌 | **Port Scanner** | TCP scan, up to 50 ports, 3s timeout | `GET /api/portscan` |
| 🔒 | **SSL Checker** | Certificate details, expiry, cipher info | `GET /api/ssl` |

<br>

## 🖼️ Screenshots

<div align="center">
  <img src="https://raw.githubusercontent.com/TheyanzXD/assets/refs/heads/main/IMG_20260729_154321.jpg" width="49%" alt="Dashboard" />
  <img src="https://raw.githubusercontent.com/TheyanzXD/assets/refs/heads/main/IMG_20260729_154345.jpg" width="49%" alt="Api docs" />
</div>

<br>

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|:---|:---|
| Frontend | HTML5 · CSS3 (dark theme) · Vanilla JavaScript |
| Backend | Node.js (built-in `dns`, `net`, `tls`, `http` modules) |
| Hosting | Vercel Edge Network + Serverless Functions |
| Dependencies | **Zero** — no npm packages required |

</div>

<br>

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- A free [Vercel](https://vercel.com) account (for deployment)

### Run Locally

```bash
# Clone the repository
git clone https://github.com/TheyanzXD/ip-track.git
cd ip-track

# Install the Vercel CLI
npm i -g vercel

# Start the local dev server
vercel dev
```

The app will be available at `http://localhost:3000`.

<br>

## 📦 Deploy

<details>
<summary><b>Option A — Vercel CLI</b></summary>

<br>

```bash
npm i -g vercel
vercel login
vercel
# Framework Preset: Other
```

</details>

<details>
<summary><b>Option B — GitHub Import</b></summary>

<br>

1. Push this repository to your own GitHub account
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repo
4. Set Framework Preset to **Other**
5. Click **Deploy** ✅

</details>

<br>

## 📡 API Endpoints

All endpoints follow the pattern `GET /api/{feature}?data={value}` and return JSON in the shape `{ status, message, data }`.

### `GET /api/ip`

```
/api/ip                  → your own IP info
/api/ip?data=8.8.8.8      → lookup a specific IP
```

<details>
<summary>📦 Example response</summary>

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
/api/dns?data=example.com&type=MX  → MX records only
```

<details>
<summary>📦 Example response</summary>

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

> [!TIP]
> Full interactive docs are available at `/docs` once deployed.

<br>

## 📁 Project Structure

```
📦 ip-track
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

<br>

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│   Vercel Edge    │────▶│   Serverless    │
│  (static)   │     │  (CDN + CORS)    │     │   Functions     │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                        │
                    ┌───────────────────────────────────┴────────┐
                    │       Built-in Node.js Modules              │
                    │   ┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
                    │   │ dns │ │ net │ │ tls  │ │ http │ │ tls │ │
                    │   └─────┘ └─────┘ └──────┘ └──────┘ └─────┘ │
                    └──────────────────────────────────────────────┘
```

<br>

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** your feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

> [!IMPORTANT]
> Please keep the zero-dependency philosophy in mind — new features should rely on native Node.js modules wherever possible.

<br>

## ⚖️ Legal & Privacy

> [!WARNING]
> - **IP Grabber:** Shows your own IP or domains you own. Not intended for tracking without consent.
> - **Port Scanner:** Only scan systems you own or have explicit permission to test.
> - **Privacy:** Zero data is stored — everything is processed in-memory and discarded after the response.

<br>

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

<br>

## 💬 Community

<div align="center">

Have a question, found a bug, or want to request a feature?

[![Issues](https://img.shields.io/badge/Open%20an-Issue-red?style=for-the-badge&logo=github)](https://github.com/TheyanzXD/ip-track/issues)
[![Pull Requests](https://img.shields.io/badge/Submit%20a-Pull%20Request-blue?style=for-the-badge&logo=github)](https://github.com/TheyanzXD/ip-track/pulls)
[![Star this repo](https://img.shields.io/badge/⭐-Star%20this%20repo-yellow?style=for-the-badge)](https://github.com/TheyanzXD/ip-track)

</div>

<br>

<div align="center">

Made with ❤️ for network diagnostics · by [**TheyanzXD**](https://github.com/TheyanzXD)

</div>

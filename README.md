<p align="center">
  <img src="https://img.shields.io/badge/status-live-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/node-%3E%3D18-blue?style=for-the-badge&logo=node.js" alt="Node">
  <img src="https://img.shields.io/badge/tests-37%20passing-green?style=for-the-badge" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License">
</p>

<div align="center">
  <h1>🌐 NetUtils</h1>
  <h3>⚡ Network Diagnostic Toolkit — Zero Dependencies ⚡</h3>
  <p>
    <strong>IP Geolocation · DNS Multi-Resolver · HTTP Headers · Port Scanner · SSL/TLS Audit · WHOIS/RDAP · CT Subdomains · Batch Jobs</strong>
  </p>
  <p>
    <a href="#-features">Features</a> •
    <a href="#-api-endpoints">API</a> •
    <a href="#-environment">Environment</a> •
    <a href="#-deploy">Deploy</a> •
    <a href="#-testing">Testing</a> •
    <a href="#-project-structure">Structure</a>
  </p>
</div>

---

## ✨ Features

| # | Tool | Description | API Endpoint |
|---|------|-------------|--------------|
| 🌐 | **IP Info** | Geolocation, ISP, ASN, proxy/VPN flags, multi-provider failover (ip-api → ipwho.is → ipinfo) | `GET /api/ip` |
| 📡 | **DNS Lookup** | A/AAAA/MX/TXT/NS/CNAME/SOA/SRV across 3 DoH resolvers (Cloudflare/Google/Quad9), DNSSEC status, resolver diff (hijack detection) | `GET /api/dns` |
| 📋 | **HTTP Headers** | Header analysis, redirect chain, security score | `GET /api/headers` |
| 🔌 | **Port Scanner** | Concurrent engine (32 workers), custom ranges, banners, SSE live progress | `GET /api/portscan` |
| 🔒 | **SSL Audit** | Chain walk, OCSP best-effort, TLS 1.0–1.3 matrix, cipher probe, score 0–100 + grade | `GET /api/ssl` |
| 🏢 | **WHOIS/RDAP** | RDAP-first (IANA bootstrap) with raw whois:43 fallback, domain/IP/ASN | `GET /api/whois` |
| 🧾 | **Cert Transparency** | Subdomain discovery via crt.sh + certspotter, issuance timeline | `GET /api/ct` |
| ⚙️ | **Batch Scan** | Async jobs (200 items, concurrency 5, retry, webhook on complete) | `POST /api/scan` |
| 🔗 | **Share Links** | 8-char Crockford codes, owner delete, SVG OG cards | `POST /api/share` |
| 🤖 | **AI Reports** | Streaming diagnostic summaries (OpenAI-compatible, optional, opt-in) | `GET /api/ai` |

Platform: i18n (EN/ID/ZH), dark mode + system sync, ⌘K command palette, geo map (zero-dep canvas), lookup history + CSV/JSON export, PWA (offline shell + last-result cache), shareable results, webhooks (HMAC-SHA256), structured logs with request IDs.

## 🛡️ Security

- **SSRF guard** (`lib/netguard.js`): IP classification (RFC1918, loopback, link-local, CGNAT, cloud metadata `169.254.169.254`, IPv6 ULA…), DNS rebinding detection (double resolve, 500ms apart), port allowlist, 5-hop redirect cap, punycode normalization, homograph/IDN-lookalike flags.
- **Rate limiting** (`lib/ratelimit.js`): sliding window per-IP per-endpoint (default 30 req/min, burst 5), token bucket, `Retry-After` + `X-RateLimit-*` headers, optional Upstash Redis backend.
- **Headers** (`vercel.json`): strict CSP, HSTS preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- **Webhooks**: HMAC-SHA256 signature (`X-Webhook-Signature`), 3 retries with 1s/5s/30s backoff.
- **AI guardrails**: daily USD budget (hard stop), 24h response cache, prompt-injection hardened.
- Uniform error contract: `{ status: "error", code, message, data }` — codes: `BAD_REQUEST`, `INVALID_TARGET`, `BLOCKED_TARGET`, `REBINDING_DETECTED`, `UNRESOLVABLE`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `SERVICE_UNAVAILABLE`, `BUDGET_EXHAUSTED`.

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

## 🌱 Environment

All optional — zero config runs in-memory.

| Variable | Purpose |
|----------|---------|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared rate limits + share links + scan cache (memory fallback otherwise) |
| `IPINFO_TOKEN` | Enable ipinfo.io as third IP provider |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | AI reports (OpenAI-compatible API) |
| `BUDGET_DAILY_USD` | Daily AI spend cap (default 1.00) |
| `SHARE_SECRET` | HMAC key for share owner tokens (auto-generated per cold start otherwise) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` (default `info`) |

## 📡 API Endpoints

All endpoints return JSON `{ status, message, data }` (errors: `{ status: "error", code, message, data }`). Full interactive spec: `/docs` (also `/openapi.json` — OpenAPI 3.1).

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
    "hosting": true,
    "meta": { "provider": "ip-api", "cached": false, "elapsedMs": 42 }
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
    },
    "dnssec": { "secure": true, "status": "validated" },
    "resolverDiff": []
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
/api/portscan?data=example.com&ports=80,443,8000-8010   # max 50 ports
/api/portscan?data=example.com&stream=1                  # SSE live progress
```

### `GET /api/ssl`
```
/api/ssl?data=google.com
/api/ssl?data=google.com&port=443
```

### `GET /api/whois`
```
/api/whois?data=example.com      # domain
/api/whois?data=8.8.8.8          # IP range (inetnum)
/api/whois?data=AS15169          # autonomous system
```

### `GET /api/ct`
```
/api/ct?data=example.com
```

### `POST /api/scan` — batch jobs
```json
{
  "tool": "dns",
  "items": ["example.com", "google.com", "cloudflare.com"],
  "webhookUrl": "https://your.app/hook",
  "webhookSecret": "optional-hmac-secret"
}
```
Poll `GET /api/scan?jobId=...`, stream `GET /api/scan?jobId=...&stream=1`, abort `?abort=1`.

### `POST /api/share` — share links
```json
{ "payload": { "tool": "ssl", "query": "example.com", "result": { } } }
```
→ `{ code: "8CHARS", url: "/#/share/8CHARS", expiresAt }` (TTL 7 days). Preview card: `GET /api/og?code=...`.

### `GET /api/ai` — AI report (SSE streaming)
```
/api/ai?tool=ssl&data=<urlencoded-json>&stream=1
```

### Platform
```
GET /api/health    → upstream reachability + memory + uptime (503 degraded)
GET /api/metrics   → rate-limit stats, cache hits, error count
```

> 📖 Full interactive docs at [`/docs`](https://your-domain.vercel.app/docs) · machine-readable spec at `/openapi.json`

## 🧪 Testing

```bash
npm test          # node --test, 37 tests across 5 suites
npm run check     # syntax check on generator scripts
```

Coverage: `netguard` (SSRF classification, punycode, target parsing, port guard), `ratelimit` (window + burst semantics), `validator` (schema subset), `scanner` (port ranges), `homograph` (confusable detection). CI (`.github/workflows/ci.yml`) runs the suite on Node 18/20/22.

## 📁 Project Structure

```
📦 network-utils
├── 📄 index.html            # Main app (9 tools + palette + share modal)
├── 📄 docs.html             # Interactive API docs + playground
├── 📄 manifest.webmanifest  # PWA manifest
├── 📄 sw.js                 # Service worker (precache + offline snapshots)
├── 📄 openapi.json          # OpenAPI 3.1 spec (generated)
├── 📄 security.txt          # + .well-known/security.txt
├── 🎨 css/style.css         # Light + dark theme (CSS tokens)
├── ⚡ js/
│   ├── main.js              # Frontend logic
│   ├── theme.js             # light/dark/system sync
│   ├── i18n.js              # EN/ID/ZH runtime
│   ├── history.js           # localStorage history + export
│   ├── palette.js           # ⌘K fuzzy command palette
│   └── map.js               # Zero-dep canvas world map
├── 🌐 locales/{en,id,zh}.json
├── 🖥️ api/
│   ├── ip.js dns.js headers.js portscan.js ssl.js
│   ├── whois.js ct.js scan.js share.js og.js ai.js
│   └── health.js metrics.js
├── 📚 lib/
│   ├── netguard.js          # SSRF guard + input validation
│   ├── ratelimit.js         # Sliding window + burst
│   ├── http.js              # Shared handler wrapper + error contract
│   ├── validator.js         # Zero-dep JSON-schema subset
│   ├── schemas.js           # Response schema source of truth
│   ├── ipintel.js doh.js dnscache.js        # DNS + IP engines
│   ├── scanner.js scanstore.js jobs.js      # Scan engines
│   ├── sslprobe.js rdap.js ct.js            # SSL/WHOIS/CT engines
│   ├── kv.js webhooks.js ai.js homograph.js # Platform services
│   └── logger.js            # Structured JSON logs + requestId
├── 🧪 test/                 # node --test suites (37 tests)
├── ⚙️ .github/workflows/ci.yml
├── 📦 package.json          # Zero dependencies
└── ⚙️ vercel.json           # Security headers + rewrites
```

## ⚖️ Legal

> **IP Grabber:** Shows your own IP or domains you own. Not for tracking without consent.
> **Port Scanner:** Only scan systems you own or have written permission to test.
> **Privacy:** Lookups are ephemeral. Share links store only the payload you explicitly publish (TTL 7 days, owner-deletable). History, theme, and language stay in your browser's localStorage. AI reports are opt-in and cached server-side for 24h only.

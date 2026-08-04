# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-04

### Fixed
- **CRITICAL:** Fixed Cloudflare Workers deployment failure caused by `import.meta.url` being `undefined` in Workers runtime (`src/index.js:10`)
- **CRITICAL:** Replaced Node.js HTTP server pattern (`createServer`, `listen`, `readFile`) with proper Cloudflare Worker `fetch` handler export
- **HIGH:** Replaced `Buffer.concat()` and `Buffer.byteLength()` with Web API equivalents (`Uint8Array` + `TextDecoder`/`TextEncoder`) in `api/scan.js` and `api/share.js`
- **MEDIUM:** Corrected base URL documentation from Vercel placeholder to Cloudflare Workers placeholder in `docs.html`
- **MEDIUM:** Updated footer branding from "Vercel serverless functions" to "Cloudflare Workers" in `index.html`
- **MEDIUM:** Updated `security.txt` and `.well-known/security.txt` placeholders to use `yourdomain.com` instead of `example.com`
- **MEDIUM:** Added `.wrangler/`, `.dev.vars`, and `wrangler.json` to `.gitignore`
- **MEDIUM:** Added `wrangler` as a `devDependency` in `package.json` for reproducible builds

### Changed
- `src/index.js` now exports a Worker-compatible `fetch` handler instead of a Node.js server instance
- Static asset handling is now delegated to Cloudflare Assets binding (configured in `wrangler.toml`)
- Request/response objects are wrapped to maintain compatibility with existing API handler signatures

### Security
- Reviewed in-memory state strategy limitations in Workers multi-instance environments
- Documented migration path for rate-limiting, scan registry, and job queue to Cloudflare KV/Durable Objects

## [1.0.0] - 2026-08-03

### Added
- Initial release with 9 network diagnostic tools: IP Info, DNS Lookup, HTTP Headers, Port Scanner, SSL/TLS Audit, WHOIS/RDAP, Certificate Transparency, Batch Scan, and Geo Map
- Multi-provider IP intelligence with failover (ip-api.com, ipwho.is)
- DNS-over-HTTPS multi-resolver queries (Cloudflare, Google, Quad9) with DNSSEC and resolver diff
- Concurrent port scanner with SSE streaming (32 workers, max 50 ports)
- SSL/TLS audit with chain validation, OCSP, TLS version matrix, and security scoring
- RDAP-first WHOIS with IANA bootstrap cache
- Certificate Transparency subdomain discovery via crt.sh with certspotter fallback
- Batch scan engine with async job queue, SSE streaming, and HMAC-signed webhooks
- Shareable result links with Crockford base32 codes and SVG OG preview cards
- AI diagnostic report generation (requires API key configuration)
- Client-side features: theme engine (light/dark/system), i18n (EN/ID/ZH), command palette, history, offline support via service worker
- Rate limiting (sliding window + token bucket, per-IP per-endpoint)
- SSRF protection with DNS rebinding detection and private IP blocking
- OpenAPI 3.1 documentation and interactive playground

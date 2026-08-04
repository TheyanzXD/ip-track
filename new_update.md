# Panduan Update: NetUtils v1.1.0

Update ini fokus pada perbaikan kritis agar aplikasi dapat di-deploy ke Cloudflare Workers. Jika Anda mengalami kegagalan deploy, ikuti panduan ini.

---

## Yang Berubah

### 1. Entry Point Sekarang Worker Fetch Handler

File `src/index.js` telah diubah dari pola Node.js HTTP server menjadi Cloudflare Worker `fetch` handler.

**Dampak:** Tidak ada perubahan cara kerja API — semua endpoint tetap berfungsi sama. Perubahan ini hanya memastikan kode kompatibel dengan runtime Cloudflare Workers.

### 2. Static Assets Dialihkan ke Cloudflare Assets

File statis (HTML, CSS, JS, icons, manifest) sekarang ditangani oleh Cloudflare Assets binding yang sudah dikonfigurasi di `wrangler.toml`.

**Dampak:** 
- Tidak perlu lagi serve static files melalui kode custom
- Performa loading asset lebih cepat karena edge cache Cloudflare
- Pastikan file assets Anda tetap berada di direktori project root (sesuai konfigurasi `[assets] directory = "."` di `wrangler.toml`)

### 3. Perbaikan Buffer Usage

Beberapa endpoint yang memproses JSON body kini menggunakan Web API (`Uint8Array`, `TextDecoder`, `TextEncoder`) вместо `Buffer` global.

**Dampak:** Tidak ada perubahan API. Perbaikan ini mencegah crash saat upload body yang besar di lingkungan Workers.

### 4. Dokumentasi & Branding

- Base URL di halaman dokumentasi kini menunjuk ke format Cloudflare Workers (`your-worker.your-subdomain.workers.dev`)
- Footer aplikasi kini menyebut "Cloudflare Workers" вместо "Vercel serverless functions"
- File `security.txt` menggunakan placeholder `yourdomain.com` — **ganti dengan domain Anda sebelum deploy**

---

## Langkah Deploy

### 1. Install Wrangler (jika belum)

```bash
npm install
```

Wrangler sekarang ada di `devDependencies`, jadi akan terinstall otomatis.

### 2. Konfigurasi Secrets (jika menggunakan fitur AI)

Jika Anda ingin mengaktifkan AI diagnostic report:

```bash
wrangler secret put AI_API_KEY
```

Masukkan API key OpenAI-compatible Anda saat diminta.

### 3. Update security.txt

Buka `security.txt` dan `.well-known/security.txt`, ganti:

```
Contact: mailto:security@yourdomain.com
Encryption: https://yourdomain.com/.well-known/pgp-key.txt
Policy: https://yourdomain.com/security-policy
Canonical: https://yourdomain.com/security.txt
```

Dengan data domain Anda yang sebenarnya.

### 4. Deploy

```bash
npm run deploy
```

Atau untuk environment development:

```bash
npm run dev
```

### 5. Verifikasi

Setelah deploy, test endpoint health:

```bash
curl https://your-worker.your-subdomain.workers.dev/api/health
```

Harus mengembalikan JSON dengan `"status":"ok"`.

---

## Catatan untuk Pengguna Existing

### State In-Memory

Semua data berikut masih disimpan in-memory dan akan hilang saat cold start:
- **Rate limit counters** — per-IP per-endpoint
- **Scan registry** — hasil port scan (TTL 10 menit)
- **Job queue** — batch scan jobs (TTL 15 menit)
- **KV cache** — DNS, IP, CT, RDAP lookups

Untuk production dengan traffic tinggi, pertimbangkan migrasi ke:
- **Rate limit:** Cloudflare KV atau Upstash Redis
- **Scan/Job registry:** Cloudflare KV atau Durable Objects
- **Cache:** Tambahkan Cloudflare Cache API sebagai L2 cache

### File .gitignore

File baru berikut telah ditambahkan ke `.gitignore`:
```
.wrangler/
.dev.vars
wrangler.json
```

Pastikan Anda tidak memiliki file tersebut yang ter-commit ke repository.

---

## Dukungan

Jika mengalami masalah setelah update:
1. Cek log deploy: `npm run tail`
2. Test lokal: `npm run dev`
3. Buka issue di repository dengan log error lengkap

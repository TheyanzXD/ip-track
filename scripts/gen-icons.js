// scripts/gen-icons.js — zero-dep PNG icon generator (node zlib + manual PNG chunks)
// Usage: node scripts/gen-icons.js
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const fillRect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c[0], c[1], c[2]); };
  const rounded = (x0, y0, w, h, r, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + r - x, x - (x0 + w - 1 - r), 0);
      const dy = Math.max(y0 + r - y, y - (y0 + h - 1 - r), 0);
      if (dx * dx + dy * dy <= r * r) set(x, y, c[0], c[1], c[2]);
    }
  };
  const BG = maskable ? [0x63, 0x5b, 0xff] : [0xfa, 0xf9, 0xf6];
  const SURF = [0xff, 0xff, 0xff];
  const INK = [0x63, 0x5b, 0xff];
  const EDGE = [0xe6, 0xe3, 0xdc];

  rounded(0, 0, size, size, size * 0.22, BG);
  if (!maskable) {
    const m = size * 0.14;
    rounded(m, m, size - 2 * m, size - 2 * m, size * 0.12, SURF);
    const e = size * 0.01;
    rounded(m + e, m + e, size - 2 * m - 2 * e, size - 2 * m - 2 * e, size * 0.11, EDGE);
  }
  // "N" glyph
  const n = size / 100;
  const y0 = 38 * n, y1 = 62 * n, x0 = 27 * n, w = 7 * n, mid = 48 * n, diagW = 15 * n;
  fillRect(x0, y0, w, y1 - y0, INK);          // left stem
  fillRect(x0 + 46 * n, y0, w, y1 - y0, INK); // right stem
  for (let i = 0; i < diagW; i++) fillRect(mid + i, y0 + (i / diagW) * (y1 - y0), w, (y1 - y0) * (1 - i / diagW), INK); // diagonal
  return png(size, size, px);
}

const jobs = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  ['icon-maskable-512.png', drawIcon(512, { maskable: true })]
];
for (const [name, buf] of jobs) {
  writeFileSync(join(outDir, name), buf);
  console.log(`wrote icons/${name} (${buf.length} bytes)`);
}

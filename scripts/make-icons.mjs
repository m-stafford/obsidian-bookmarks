// Generates icons/icon{16,32,48,128}.png with no image library: a purple
// rounded square with a white bookmark. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];
const BACKGROUND = [0x5b, 0x3f, 0xd1];
const FOREGROUND = [0xff, 0xff, 0xff];
const SUPERSAMPLE = 4;

// Geometry in unit coordinates (0..1 across the icon).
const SQUARE = { lo: 0.03, hi: 0.97, radius: 0.22 };
const BOOKMARK = { left: 0.34, right: 0.66, top: 0.18, bottom: 0.82, notch: 0.14 };

function inRoundedSquare(u, v) {
  const { lo, hi, radius } = SQUARE;
  if (u < lo || u > hi || v < lo || v > hi) return false;
  const cx = Math.min(Math.max(u, lo + radius), hi - radius);
  const cy = Math.min(Math.max(v, lo + radius), hi - radius);
  return (u - cx) ** 2 + (v - cy) ** 2 <= radius * radius;
}

function inBookmark(u, v) {
  const { left, right, top, bottom, notch } = BOOKMARK;
  if (u < left || u > right || v < top || v > bottom) return false;
  const halfWidth = (right - left) / 2;
  const edge = bottom - notch * (1 - Math.abs(u - 0.5) / halfWidth); // V notch, deepest at center
  return v <= edge;
}

function samplePixel(x, y, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let covered = 0;
  for (let i = 0; i < SUPERSAMPLE; i++) {
    for (let j = 0; j < SUPERSAMPLE; j++) {
      const u = (x + (i + 0.5) / SUPERSAMPLE) / size;
      const v = (y + (j + 0.5) / SUPERSAMPLE) / size;
      if (!inRoundedSquare(u, v)) continue;
      const [cr, cg, cb] = inBookmark(u, v) ? FOREGROUND : BACKGROUND;
      r += cr;
      g += cg;
      b += cb;
      covered += 1;
    }
  }
  if (covered === 0) return [0, 0, 0, 0];
  const alpha = Math.round((covered / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
  return [Math.round(r / covered), Math.round(g / covered), Math.round(b / covered), alpha];
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0, 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rgba.set(samplePixel(x, y, size), (y * size + x) * 4);
    }
  }
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePng(size, rgba));
  console.log(`wrote ${file}`);
}

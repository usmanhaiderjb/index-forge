/**
 * Generates the app's brand assets as PNGs.
 *
 * Written as a script rather than checking in binaries: the mark is three
 * ascending bars — the same rank-chart motif the web wordmark uses — and
 * regenerating it beats hand-editing a PNG when the brand colour changes.
 *
 *   node scripts/generate-assets.cjs
 *
 * Uses only node:zlib, so there is no image dependency to install or keep
 * current.
 */
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const BRAND = [0x63, 0x38, 0xf5]; // #6338f5, the marketing violet
const WHITE = [0xff, 0xff, 0xff];

/** Minimal RGBA PNG writer. */
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

/**
 * The mark: three ascending bars with rounded ends, centred.
 * `scale` is the fraction of the canvas the mark occupies.
 */
function bars({ size, color, background, scale = 0.52, radiusFrac = 0.22 }) {
  const markW = size * scale;
  const markH = size * scale;
  const left = (size - markW) / 2;
  const bottom = (size + markH) / 2;

  const gap = markW * 0.16;
  const barW = (markW - gap * 2) / 3;
  const heights = [markH * 0.44, markH * 0.72, markH * 1.0];
  const round = barW * 0.34;

  // Rounded-rectangle test, so the bars do not read as raw blocks at any size.
  const inBar = (x, y, bx, by, bw, bh, r) => {
    if (x < bx || x > bx + bw || y < by || y > by + bh) return false;
    const cx = Math.min(Math.max(x, bx + r), bx + bw - r);
    const cy = Math.min(Math.max(y, by + r), by + bh - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r;
  };

  const bgRadius = size * radiusFrac;

  return (x, y) => {
    for (let i = 0; i < 3; i++) {
      const bx = left + i * (barW + gap);
      const by = bottom - heights[i];
      if (inBar(x, y, bx, by, barW, heights[i], round)) return [...color, 255];
    }
    if (!background) return [0, 0, 0, 0];
    // Rounded app-icon square.
    const r = bgRadius;
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r;
    return inside ? [...background, 255] : [0, 0, 0, 0];
  };
}

const out = path.join(__dirname, "..", "assets");
fs.mkdirSync(out, { recursive: true });

const files = [
  // Store icon: brand square, white mark.
  ["icon.png", 1024, bars({ size: 1024, color: WHITE, background: BRAND })],
  // Android adaptive foreground: transparent, and inset further because the
  // launcher applies its own mask and crops the outer ~28%.
  [
    "adaptive-icon.png",
    1024,
    bars({ size: 1024, color: WHITE, background: null, scale: 0.38 }),
  ],
  // Splash mark: brand-coloured on a transparent field, since the splash
  // background colour is set in app.config.ts.
  ["splash-icon.png", 512, bars({ size: 512, color: BRAND, background: null, scale: 0.62 })],
  // Android notification icon must be a white-on-transparent silhouette —
  // the system tints it and ignores any colour it is given.
  [
    "notification-icon.png",
    96,
    bars({ size: 96, color: WHITE, background: null, scale: 0.66 }),
  ],
  ["favicon.png", 48, bars({ size: 48, color: WHITE, background: BRAND, radiusFrac: 0.24 })],
];

for (const [name, size, paint] of files) {
  fs.writeFileSync(path.join(out, name), png(size, size, paint));
  console.log("wrote", name, `${size}x${size}`);
}

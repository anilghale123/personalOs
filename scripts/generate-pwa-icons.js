/**
 * Generates the PWA app icons (a "circle-dot" mark on a dark square)
 * as PNG files in /public. No image dependencies — encodes PNG directly.
 *
 * Run: node scripts/generate-pwa-icons.js
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const BG = [16, 16, 18]; // near-black
const FG = [245, 166, 35]; // brand gold

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c >>> 0) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Is point (px,py) part of the circle-dot mark? */
function inMark(px, py, c, R, t, dot) {
  const d = Math.hypot(px - c, py - c);
  return d <= dot || (d >= R - t && d <= R);
}

function makePNG(size) {
  const c = size / 2;
  const R = size * 0.3; // outer ring radius
  const t = size * 0.085; // ring thickness
  const dot = size * 0.072; // centre dot radius

  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // 2x2 supersampling for smooth edges.
      let hits = 0;
      for (const oy of [0.25, 0.75]) {
        for (const ox of [0.25, 0.75]) {
          if (inMark(x + ox, y + oy, c, R, t, dot)) hits++;
        }
      }
      const a = hits / 4;
      raw[p++] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      raw[p++] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      raw[p++] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, "..", "public");
const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of targets) {
  fs.writeFileSync(path.join(out, name), makePNG(size));
  console.log(`generated public/${name} (${size}x${size})`);
}

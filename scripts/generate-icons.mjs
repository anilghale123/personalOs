/**
 * Render every app icon from one drawing.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark: three rising bars (money logged, a week of progress) with a
 * checkmark over them (goals done) — expenses, planner and goals in one
 * shape, on the app's warm clay brand colour.
 *
 * Outputs (all in /public):
 *   icon.svg               vector favicon for modern browsers
 *   favicon.ico            16/32/48 for everything that asks for /favicon.ico
 *   icon-192.png / 512     manifest "any" icons — rounded, transparent corners
 *   icon-maskable-512.png  Android adaptive icon — full bleed, mark in the safe zone
 *   apple-touch-icon.png   iOS home screen — full bleed, iOS rounds it itself
 *   badge-96.png           notification badge — white silhouette, Android uses alpha only
 *
 * After changing the drawing, bump CACHE_VERSION in public/sw.js: the worker
 * caches icons forever under these same URLs.
 */

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const OUT = new URL("../public/", import.meta.url);

const CREAM = "#FFF7EC";
const GRADIENT_FROM = "#DE8B52";
const GRADIENT_TO = "#A8551E";

/** The mark on a 512 grid, scaled about the centre for safe zones. */
function mark({ scale = 1, color = CREAM, barOpacity = 0.62 }) {
  const transform = `translate(256 256) scale(${scale}) translate(-256 -256) translate(-4 18)`;
  return `
  <g transform="${transform}">
    <rect x="118" y="318" width="64" height="82" rx="22" fill="${color}" fill-opacity="${barOpacity}"/>
    <rect x="224" y="280" width="64" height="120" rx="22" fill="${color}" fill-opacity="${barOpacity}"/>
    <rect x="330" y="232" width="64" height="168" rx="22" fill="${color}" fill-opacity="${barOpacity}"/>
    <path d="M128 196 L206 270 L392 100" fill="none" stroke="${color}"
      stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function svg({ background = "rounded", scale = 1, color, barOpacity }) {
  const bg =
    background === "none"
      ? ""
      : `<rect width="512" height="512" ${background === "rounded" ? 'rx="116"' : ""} fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRADIENT_FROM}"/>
      <stop offset="1" stop-color="${GRADIENT_TO}"/>
    </linearGradient>
  </defs>
  ${bg}${mark({ scale, color, barOpacity })}
</svg>`;
}

function png(source, size) {
  return new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
}

/** An .ico that embeds PNGs — valid everywhere that matters since Vista. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const rounded = svg({ background: "rounded" });
const fullBleed = (scale) => svg({ background: "square", scale });

const outputs = {
  "icon.svg": Buffer.from(rounded),
  "icon-192.png": png(rounded, 192),
  "icon-512.png": png(rounded, 512),
  // Android's safe zone is the centre 80% circle.
  "icon-maskable-512.png": png(fullBleed(0.76), 512),
  "apple-touch-icon.png": png(fullBleed(0.84), 180),
  "badge-96.png": png(svg({ background: "none", scale: 1.12, color: "#FFFFFF", barOpacity: 1 }), 96),
  "favicon.ico": ico([16, 32, 48].map((size) => ({ size, data: png(rounded, size) }))),
};

for (const [name, data] of Object.entries(outputs)) {
  writeFileSync(new URL(name, OUT), data);
  console.log(`wrote public/${name} (${data.length} bytes)`);
}

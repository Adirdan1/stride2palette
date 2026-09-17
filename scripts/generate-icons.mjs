/**
 * Generate the PWA icon set.
 *
 *   node scripts/generate-icons.mjs
 *
 * The icon mark is the collection's, not this app's: four rising bars — "the
 * climb" — with the tallest one live, topped by whatever that app is climbing
 * towards. Stride's summit is a flame, stride2mortgage's is a house. This one's
 * is a lit doorway, because the thing being climbed towards here is opening day.
 *
 * Note that this is deliberately *not* the mark the app draws on screen. The
 * in-app mark is the door in three tonal layers (app/components/Mark.js); the
 * climb is what makes the icons on a home screen read as siblings. Same
 * relationship as Stride, whose screen mark is a flame and whose icon is a
 * flame on top of the climb.
 *
 * The three tones inside the doorway are the same three the screen mark uses:
 * frame, leaf, and the light beyond. So the summit is this app's own mark,
 * standing on the family's.
 *
 * No image library. PNG is a short format — signature, IHDR, a zlib-deflated
 * block of scanlines, IEND — and zlib is in the standard library.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'icons');

/**
 * `spent` is recessed but never invisible — the climb has to read as four bars
 * even when only one is lit. `summit` is the brighter step up from `live`, so
 * the eye travels to the top, and `glow` is the one warm note in the icon.
 */
const PALETTE = {
  ground: [0x13, 0x12, 0x10], // the app's dark paper
  spent: [0x3d, 0x45, 0x40],
  live: [0x3d, 0x8a, 0x66], // bay-bright
  summit: [0x6f, 0xbf, 0x93], // bay, lifted — the door frame
  glow: [0xf0, 0xd5, 0x9c], // the light beyond the door
  // The leaf has to be its own tone rather than reusing `live`. Drawn in the
  // bar's colour it fused with the bar underneath it and the whole summit went
  // back to reading as a lollipop — the door has to sit on the climb, not grow
  // out of it. This is the screen mark's --door-frame, the darkest of its three.
  leaf: [0x2a, 0x4d, 0x3b],
};

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** 8-bit truecolour, no alpha. Icons are opaque by design — iOS requires it. */
function encodePng(size, pixels) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing
//
// Shapes are a predicate — "is this point inside?" — sampled on a 4x4 grid per
// pixel. Slower than solving coverage analytically, but it costs milliseconds at
// these sizes and a rounded bar and an arch draw through one code path.
// ---------------------------------------------------------------------------

const SAMPLES = 4;

function surface(size, colour) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = colour[0];
    pixels[i + 1] = colour[1];
    pixels[i + 2] = colour[2];
  }
  return pixels;
}

function fillShape(pixels, size, inside, colour, bounds) {
  const step = 1 / SAMPLES;
  const offset = step / 2;

  const x0 = Math.max(0, Math.floor(bounds.x0 * size));
  const x1 = Math.min(size, Math.ceil(bounds.x1 * size));
  const y0 = Math.max(0, Math.floor(bounds.y0 * size));
  const y1 = Math.min(size, Math.ceil(bounds.y1 * size));

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          if (inside((px + offset + sx * step) / size, (py + offset + sy * step) / size)) hits += 1;
        }
      }
      if (!hits) continue;

      const a = hits / (SAMPLES * SAMPLES);
      const i = (py * size + px) * 3;
      pixels[i] = Math.round(pixels[i] * (1 - a) + colour[0] * a);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - a) + colour[1] * a);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - a) + colour[2] * a);
    }
  }
}

/** Rounded rectangle, in unit coordinates. */
const roundedRect = (x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const dx = Math.max(x + radius - px, 0, px - (x + w - radius));
    const dy = Math.max(y + radius - py, 0, py - (y + h - radius));
    return dx * dx + dy * dy <= radius * radius;
  };
};

/** A doorway: semicircular head, straight sides, open at the bottom. */
const arch = (x, y, w, h) => {
  const r = w / 2;
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    if (py >= y + r) return true;
    return (px - (x + r)) ** 2 + (py - (y + r)) ** 2 <= r * r;
  };
};

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

const BAR_W = 0.105;
const BAR_GAP = 0.055;
const HEIGHTS = [0.20, 0.30, 0.40, 0.52];
const RADIUS = 0.032;

/**
 * `inset` pulls the mark towards the centre for maskable icons, whose edges are
 * cropped to whatever shape the launcher feels like using.
 */
function drawMark(pixels, size, inset = 0) {
  const scale = 1 - inset * 2;
  const at = (v) => inset + v * scale;
  const sz = (v) => v * scale;

  const baseline = 0.82;
  const spanW = HEIGHTS.length * BAR_W + (HEIGHTS.length - 1) * BAR_GAP;
  const startX = (1 - spanW) / 2;

  HEIGHTS.forEach((height, i) => {
    const x = startX + i * (BAR_W + BAR_GAP);
    const top = baseline - height;
    const live = i === HEIGHTS.length - 1;

    fillShape(
      pixels,
      size,
      roundedRect(at(x), at(top), sz(BAR_W), sz(height), sz(RADIUS)),
      live ? PALETTE.live : PALETTE.spent,
      { x0: at(x) - 0.01, x1: at(x + BAR_W) + 0.01, y0: at(top) - 0.01, y1: at(baseline) + 0.01 },
    );
  });

  // The summit: a lit doorway standing on the live bar.
  //
  // Drawn as three layers rather than an outline, for the reason the house
  // summit needed walls: a bare arch at 192px reads as a tombstone. What makes
  // it a doorway is the light inside it and the leaf standing across part of
  // that light.
  const liveX = startX + (HEIGHTS.length - 1) * (BAR_W + BAR_GAP);
  const cx = liveX + BAR_W / 2;
  const barTop = baseline - HEIGHTS[HEIGHTS.length - 1];

  const halfW = BAR_W * 1.15;
  const doorH = 0.265;
  // Sunk deep into the bar, not balanced on top of it. The first attempt perched
  // a short arch on the bar's tip and the result read as a lollipop: the bar
  // carried on below as a stem, and an arch barely taller than it is wide is a
  // knob rather than a doorway. Swallowing the top of the bar removes the stem,
  // and the height is what makes it a door — it needs straight sides clearly
  // longer than the semicircular head above them.
  const doorBottom = barTop + 0.105;
  const doorY = doorBottom - doorH;
  const stroke = 0.030;

  const bounds = {
    x0: at(cx - halfW) - 0.01,
    x1: at(cx + halfW) + 0.01,
    y0: at(doorY) - 0.01,
    y1: at(doorBottom) + 0.01,
  };

  // 1. The frame, solid.
  fillShape(pixels, size, arch(at(cx - halfW), at(doorY), sz(halfW * 2), sz(doorH)), PALETTE.summit, bounds);

  // 2. The room beyond, cut out of it.
  const innerW = halfW * 2 - stroke * 2;
  const innerX = cx - halfW + stroke;
  const innerY = doorY + stroke;
  fillShape(
    pixels, size,
    arch(at(innerX), at(innerY), sz(innerW), sz(doorBottom - innerY)),
    PALETTE.glow, bounds,
  );

  // 3. The leaf, standing across part of the light and starting below the
  //    springing of the arch — so the light spills over the top of the door,
  //    exactly as it does in the on-screen mark.
  const leafY = innerY + innerW / 2;
  fillShape(
    pixels, size,
    roundedRect(at(innerX), at(leafY), sz(innerW * 0.6), sz(doorBottom - leafY), 0),
    PALETTE.leaf, bounds,
  );
}

function render(size, inset = 0) {
  const pixels = surface(size, PALETTE.ground);
  drawMark(pixels, size, inset);
  return encodePng(size, pixels);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

const files = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  // Maskable icons get cropped to whatever shape the launcher likes, so the mark
  // is pulled well inside the safe zone.
  ['icon-192-maskable.png', render(192, 0.12)],
  ['icon-512-maskable.png', render(512, 0.12)],
  ['apple-touch-icon.png', render(180)],
  ['favicon-32.png', render(32)],
];

for (const [name, data] of files) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name.padEnd(24)} ${String(data.length).padStart(7)} bytes`);
}

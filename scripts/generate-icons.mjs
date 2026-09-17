/**
 * Generate the PWA icon set.
 *
 *   node scripts/generate-icons.mjs
 *
 * The icon mark is the collection's, not this app's: four rising bars — "the
 * climb" — with the tallest one live, topped by whatever that app is climbing
 * towards. Stride's summit is a flame, stride2mortgage's is a house. This one's
 * is an artist's palette, loaded with the colours of a lasagna.
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
  ground: [0x14, 0x10, 0x0c], // the app's dark paper
  spent: [0x3a, 0x2f, 0x22],
  live: [0x4f, 0x8a, 0x40], // basil-bright
  summit: [0xc7, 0x9a, 0x63], // the palette board — light, so it caps the climb
  // The paint, matching the on-screen mark. Bright values, not the text-safe
  // accents: four dark dabs on a board vanish at 192px and in greyscale.
  pasta: [0xf2, 0xe2, 0xc4],
  ragu: [0xd9, 0x4a, 0x35],
  cheese: [0xe8, 0xa9, 0x3c],
  basil: [0x6a, 0xab, 0x4a],
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

const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

/** The palette board, and the shape the thumb hole is punched out of. */
const ellipse = (cx, cy, rx, ry) => (px, py) =>
  ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;

/** Subtraction, which is how the palette gets its waist and its thumb hole. */
const without = (shape, ...holes) => (px, py) =>
  shape(px, py) && !holes.some((hole) => hole(px, py));

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

  // The summit: an artist's palette resting on the live bar.
  //
  // The thumb hole is what makes an ellipse read as a palette, so it is punched
  // in the ground colour rather than left out — and the blobs are the three
  // lasagna layers, which is the same joke the on-screen mark tells.
  //
  // Sunk into the bar rather than balanced on it, for the reason every summit in
  // this family is: a shape perched on the tip leaves the bar showing below as a
  // stem and the whole thing reads as a lollipop.
  const liveX = startX + (HEIGHTS.length - 1) * (BAR_W + BAR_GAP);
  const cx = liveX + BAR_W / 2;
  const barTop = baseline - HEIGHTS[HEIGHTS.length - 1];

  const rx = 0.118;
  const ry = 0.097;
  const cy = barTop - ry * 0.46;

  const bounds = {
    x0: at(cx - rx) - 0.01,
    x1: at(cx + rx) + 0.01,
    y0: at(cy - ry) - 0.01,
    y1: at(cy + ry) + 0.01,
  };

  // 1. The board, with a bite taken out of the lower right.
  //
  //    That waist is what makes the shape a palette rather than an oval. The
  //    first version of this was a plain ellipse and read as a lollipop head;
  //    the on-screen mark hit the same problem and was fixed the same way.
  const notch = circle(at(cx + rx * 0.84), at(cy + ry * 1.02), sz(rx * 0.46));
  fillShape(
    pixels, size,
    without(ellipse(at(cx), at(cy), sz(rx), sz(ry)), notch),
    PALETTE.summit, bounds,
  );

  // 2. The thumb hole, back to the ground colour.
  fillShape(
    pixels, size,
    circle(at(cx - rx * 0.46), at(cy + ry * 0.26), sz(rx * 0.2)),
    PALETTE.ground, bounds,
  );

  // 3. The paint — the four layers of a lasagna.
  const dabs = [
    [cx - rx * 0.48, cy - ry * 0.42, rx * 0.2, PALETTE.pasta],
    [cx - rx * 0.05, cy - ry * 0.62, rx * 0.22, PALETTE.ragu],
    [cx + rx * 0.42, cy - ry * 0.38, rx * 0.19, PALETTE.cheese],
    [cx + rx * 0.52, cy + ry * 0.18, rx * 0.17, PALETTE.basil],
  ];
  for (const [bx, by, br, colour] of dabs) {
    fillShape(pixels, size, circle(at(bx), at(by), sz(br)), colour, bounds);
  }
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

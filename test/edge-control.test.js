import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS_PATH = '../app/globals.css';

/**
 * The outline of a control — a field, an unticked box, a switch track — must
 * clear 3:1 against the ground it sits on (WCAG 1.4.11). --edge-control is the
 * collection's token for it (ship-stride-app skill, 2026-11); this asserts it
 * in both themes, read straight out of the real stylesheet.
 *
 * Each token is declared once for light and once for dark, in that order, so
 * the first and second declarations are the two themes.
 */
const css = readFileSync(new URL(CSS_PATH, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function themes() {
  const light = {}, dark = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (!(m[1] in light)) light[m[1]] = m[2];
    else if (!(m[1] in dark)) dark[m[1]] = m[2];
  }
  return { light, dark: { ...light, ...dark } };
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const GROUNDS = ['paper', 'surface'];

for (const [name, theme] of Object.entries(themes())) {
  describe(`control outlines — ${name}`, () => {
    for (const ground of GROUNDS) {
      it(`--edge-control on --${ground} clears 3:1`, () => {
        expect(theme['edge-control'], '--edge-control missing').toBeTruthy();
        expect(ratio(theme['edge-control'], theme[ground])).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

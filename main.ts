// The World Bulletin — front page of 19 November 2026, drawn entirely in code.
// Node standard library only. No network, no child processes, no external files
// or fonts. Four typefaces are drawn from code: a Didone display face for the
// masthead, a bold serif for headlines, a lighter serif for body text, and a
// clean uniform-stroke sans for labels, dates and the weather strip. Every run
// produces byte-identical output.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const PAPER: [number, number, number] = [244, 237, 219];
const INK: [number, number, number] = [24, 24, 24];
const RED: [number, number, number] = [214, 56, 36];
const TEAL: [number, number, number] = [28, 134, 134];
const CREAM: [number, number, number] = [244, 237, 219];

type Color = [number, number, number];
type Pt = [number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buf = new Uint8Array(W * H * 3);
{
  const rnd = mulberry32(20261119);
  for (let i = 0; i < W * H; i++) {
    const n = (rnd() * 2 - 1) * 5;
    buf[i * 3] = Math.max(0, Math.min(255, PAPER[0] + n));
    buf[i * 3 + 1] = Math.max(0, Math.min(255, PAPER[1] + n));
    buf[i * 3 + 2] = Math.max(0, Math.min(255, PAPER[2] + n));
  }
}

function setPx(x: number, y: number, c: Color): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

// Scanline fill, nonzero rule, for one simple polygon.
function fillPoly(pts: Pt[], c: Color): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c);
    }
  }
}

// Even-odd fill across several polygons at once (used for rings: outer + inner).
function fillPolysEvenOdd(polys: Pt[][], c: Color): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pts of polys)
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (const pts of polys) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c);
    }
  }
}

function rect(x0: number, y0: number, x1: number, y1: number, c: Color): void {
  fillPoly(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    c,
  );
}

function hline(x0: number, x1: number, y: number, t: number, c: Color): void {
  rect(x0, y - t / 2, x1, y + t / 2, c);
}

function vline(x: number, y0: number, y1: number, t: number, c: Color): void {
  rect(x - t / 2, y0, x + t / 2, y1, c);
}

function lineQuad(x0: number, y0: number, x1: number, y1: number, t: number): Pt[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (t / 2);
  const ny = (dx / len) * (t / 2);
  return [
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ];
}

function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: Color): void {
  fillPoly(lineQuad(x0, y0, x1, y1, t), c);
}

function octPts(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

function circlePts(cx: number, cy: number, r: number, n = 28): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function disc(cx: number, cy: number, r: number, c: Color): void {
  fillPoly(circlePts(cx, cy, r), c);
}

// Octagon ring: outer minus inner, wall thickness t.
function ring(cx: number, cy: number, rx: number, ry: number, t: number, c: Color): void {
  const outer = octPts(cx, cy, rx, ry);
  const inner = octPts(cx, cy, Math.max(0.1, rx - t), Math.max(0.1, ry - t));
  fillPolysEvenOdd([outer, inner], c);
}

// Ellipse outline as a ring of two 28-gons.
function ellipseRing(cx: number, cy: number, rx: number, ry: number, t: number, c: Color): void {
  const outer = circlePts(cx, cy, 1, 28).map(([x, y]): Pt => [cx + (x - cx) * rx, cy + (y - cy) * ry]);
  const inner = circlePts(cx, cy, 1, 28).map(([x, y]): Pt => [
    cx + (x - cx) * Math.max(0.1, rx - t),
    cy + (y - cy) * Math.max(0.1, ry - t),
  ]);
  fillPolysEvenOdd([outer, inner], c);
}

// ---------------------------------------------------------------- glyphs
// One glyph = advance width in units (cap height = 7 units, baseline y = 7,
// x-height top y = 2, descender bottom y = 9) + stroke parts:
//   v: vertical bar [x, y0, y1]            h: horizontal bar [y, x0, x1]
//   d: diagonal bar [x0, y0, x1, y1]      o: ring [cx, cy, rx, ry]
//   f: filled octagon [cx, cy, rx, ry]
// Thickness comes from the font: verticals and diagonals use tv, horizontals
// use th, rings use tv. Serif fonts add foot bars to vertical-stem ends.
type Part =
  | ["v", number, number, number]
  | ["h", number, number, number]
  | ["d", number, number, number, number]
  | ["o", number, number, number, number]
  | ["f", number, number, number, number];
type Glyph = { w: number; p: Part[] };

const GLYPHS: Record<string, Glyph> = {
  A: { w: 5.6, p: [["d", 0.4, 7, 2.8, 0], ["d", 2.8, 0, 5.2, 7], ["h", 4.4, 1.5, 4.1]] },
  B: { w: 5.2, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.4], ["h", 3.5, 0.7, 4.4], ["h", 6.6, 0.7, 4.4], ["v", 4.4, 0.4, 3.5], ["v", 4.4, 3.5, 6.6]] },
  C: { w: 5.4, p: [["h", 0.4, 1.0, 4.7], ["d", 1.0, 0.4, 0.4, 1.9], ["v", 0.7, 1.9, 5.1], ["d", 0.4, 5.1, 1.0, 6.6], ["h", 6.6, 1.0, 4.7]] },
  D: { w: 5.6, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.3], ["h", 6.6, 0.7, 4.3], ["v", 4.8, 0.4, 6.6], ["d", 4.3, 0.4, 4.8, 1.3], ["d", 4.8, 5.7, 4.3, 6.6]] },
  E: { w: 5.0, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.6], ["h", 3.5, 0.7, 4.0], ["h", 6.6, 0.7, 4.6]] },
  F: { w: 4.8, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.6], ["h", 3.5, 0.7, 4.0]] },
  G: { w: 5.6, p: [["h", 0.4, 1.0, 4.7], ["d", 1.0, 0.4, 0.4, 1.9], ["v", 0.7, 1.9, 5.1], ["d", 0.4, 5.1, 1.0, 6.6], ["h", 6.6, 1.0, 4.7], ["h", 3.9, 3.2, 4.7], ["v", 4.7, 3.9, 6.6]] },
  H: { w: 5.8, p: [["v", 0.7, 0, 7], ["v", 5.1, 0, 7], ["h", 3.5, 0.7, 5.1]] },
  I: { w: 3.0, p: [["v", 1.5, 0, 7], ["h", 0.4, 0.3, 2.7], ["h", 6.6, 0.3, 2.7]] },
  J: { w: 4.8, p: [["v", 4.0, 0, 5.6], ["h", 6.6, 1.0, 4.0], ["d", 1.0, 6.6, 0.5, 5.2]] },
  K: { w: 5.6, p: [["v", 0.7, 0, 7], ["h", 3.5, 0.7, 2.7], ["d", 2.7, 3.5, 5.2, 0.2], ["d", 2.7, 3.5, 5.2, 6.8]] },
  L: { w: 4.8, p: [["v", 0.7, 0, 7], ["h", 6.6, 0.7, 4.6]] },
  M: { w: 7.0, p: [["v", 0.7, 0, 7], ["v", 6.3, 0, 7], ["d", 0.7, 0, 3.5, 3.8], ["d", 6.3, 0, 3.5, 3.8]] },
  N: { w: 5.8, p: [["v", 0.7, 0, 7], ["v", 5.1, 0, 7], ["d", 0.7, 0, 5.1, 7]] },
  O: { w: 6.0, p: [["o", 3.0, 3.5, 2.5, 3.0]] },
  P: { w: 5.4, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.4], ["h", 3.5, 0.7, 4.4], ["v", 4.4, 0.4, 3.5]] },
  Q: { w: 6.0, p: [["o", 3.0, 3.5, 2.5, 3.0], ["d", 4.2, 5.2, 5.6, 7]] },
  R: { w: 5.6, p: [["v", 0.7, 0, 7], ["h", 0.4, 0.7, 4.4], ["h", 3.5, 0.7, 4.4], ["v", 4.4, 0.4, 3.5], ["d", 2.7, 3.5, 5.2, 7]] },
  S: { w: 5.4, p: [["d", 4.54, 1.42, 4.23, 0.95], ["d", 4.23, 0.95, 3.75, 0.61], ["d", 3.75, 0.61, 3.16, 0.42], ["d", 3.16, 0.42, 2.54, 0.42], ["d", 2.54, 0.42, 1.95, 0.61], ["d", 1.95, 0.61, 1.47, 0.95], ["d", 1.47, 0.95, 1.16, 1.42], ["d", 1.16, 1.42, 1.05, 1.95], ["d", 1.05, 1.95, 1.16, 2.48], ["d", 1.16, 2.48, 1.47, 2.95], ["d", 1.47, 2.95, 1.95, 3.29], ["d", 1.95, 3.29, 2.54, 3.48], ["d", 2.54, 3.48, 2.85, 3.5], ["d", 2.85, 3.5, 3.52, 3.5], ["d", 3.52, 3.5, 4.1, 3.77], ["d", 4.1, 3.77, 4.54, 4.2], ["d", 4.54, 4.2, 4.77, 4.72], ["d", 4.77, 4.72, 4.77, 5.28], ["d", 4.77, 5.28, 4.54, 5.8], ["d", 4.54, 5.8, 4.1, 6.23], ["d", 4.1, 6.23, 3.52, 6.5], ["d", 3.52, 6.5, 2.85, 6.6], ["d", 2.85, 6.6, 2.18, 6.5], ["d", 2.18, 6.5, 1.6, 6.23], ["d", 1.6, 6.23, 1.16, 5.8], ["d", 1.16, 5.8, 0.93, 5.28]] },
  T: { w: 5.4, p: [["h", 0.4, 0.4, 5.0], ["v", 2.7, 0.4, 7]] },
  U: { w: 5.8, p: [["v", 0.7, 0, 6.4], ["v", 5.1, 0, 6.4], ["h", 6.6, 0.7, 5.1]] },
  V: { w: 5.8, p: [["d", 0.4, 0, 2.9, 7], ["d", 2.9, 7, 5.4, 0]] },
  W: { w: 8.2, p: [["d", 0.4, 0, 2.05, 7], ["d", 2.05, 7, 4.1, 0], ["d", 4.1, 0, 6.15, 7], ["d", 6.15, 7, 7.8, 0]] },
  X: { w: 5.8, p: [["d", 0.4, 0, 5.4, 7], ["d", 5.4, 0, 0.4, 7]] },
  Y: { w: 5.8, p: [["d", 0.4, 0, 2.9, 3.8], ["d", 5.4, 0, 2.9, 3.8], ["v", 2.9, 3.8, 7]] },
  Z: { w: 5.4, p: [["h", 0.4, 0.6, 4.8], ["d", 4.8, 0.4, 0.6, 6.6], ["h", 6.6, 0.6, 4.8]] },
  a: { w: 5.2, p: [["o", 2.5, 5.0, 1.7, 1.8], ["v", 4.2, 2, 7]] },
  b: { w: 5.2, p: [["v", 0.9, 0, 7], ["o", 3.0, 5.0, 1.6, 1.8]] },
  c: { w: 4.8, p: [["h", 2.4, 1.0, 4.2], ["d", 1.0, 2.4, 0.4, 3.8], ["v", 0.7, 3.8, 5.4], ["d", 0.4, 5.4, 1.0, 6.6], ["h", 6.6, 1.0, 4.2]] },
  d: { w: 5.2, p: [["o", 2.3, 5.0, 1.6, 1.8], ["v", 4.3, 0, 7]] },
  e: { w: 5.0, p: [["h", 2.4, 1.0, 4.2], ["d", 1.0, 2.4, 0.4, 3.8], ["v", 0.7, 3.8, 5.4], ["d", 0.4, 5.4, 1.0, 6.6], ["h", 6.6, 1.0, 4.2], ["h", 4.4, 0.9, 4.2]] },
  f: { w: 3.4, p: [["d", 1.0, 1.6, 1.9, 0.4], ["h", 0.6, 1.0, 3.1], ["v", 1.9, 0.6, 7], ["h", 3.2, 0.9, 3.1]] },
  g: { w: 5.2, p: [["o", 2.5, 5.0, 1.7, 1.8], ["v", 4.2, 2, 8.8], ["h", 8.8, 2.0, 4.2], ["d", 2.0, 8.8, 1.5, 7.6]] },
  h: { w: 5.4, p: [["v", 0.9, 0, 7], ["h", 2.2, 0.9, 4.5], ["v", 4.5, 2.2, 7]] },
  i: { w: 2.6, p: [["v", 1.3, 3.6, 7], ["f", 1.3, 1.4, 0.55, 0.55]] },
  j: { w: 3.0, p: [["v", 1.8, 3.6, 8.6], ["f", 1.8, 1.4, 0.55, 0.55], ["h", 8.8, 0.7, 1.8], ["d", 0.7, 8.8, 0.3, 7.6]] },
  k: { w: 5.0, p: [["v", 0.9, 0, 7], ["h", 4.9, 0.9, 2.5], ["d", 2.5, 4.9, 4.6, 2.2], ["d", 2.5, 4.9, 4.6, 6.8]] },
  l: { w: 2.6, p: [["v", 1.3, 0, 7]] },
  m: { w: 7.8, p: [["v", 0.9, 2, 7], ["h", 2.2, 0.9, 4.0], ["v", 4.0, 2.2, 7], ["h", 2.2, 4.0, 6.9], ["v", 6.9, 2.2, 7]] },
  n: { w: 5.4, p: [["v", 0.9, 2, 7], ["h", 2.2, 0.9, 4.5], ["v", 4.5, 2.2, 7]] },
  o: { w: 5.0, p: [["o", 2.5, 4.9, 1.7, 1.8]] },
  p: { w: 5.2, p: [["v", 0.9, 2, 9], ["o", 3.0, 5.0, 1.6, 1.8]] },
  q: { w: 5.2, p: [["o", 2.3, 5.0, 1.6, 1.8], ["v", 4.3, 2, 9]] },
  r: { w: 3.6, p: [["v", 0.9, 2, 7], ["h", 2.2, 0.9, 2.8], ["v", 2.8, 2.2, 3.6]] },
  s: { w: 4.8, p: [["d", 3.86, 3.09, 3.59, 2.78], ["d", 3.59, 2.78, 3.18, 2.54], ["d", 3.18, 2.54, 2.67, 2.42], ["d", 2.67, 2.42, 2.13, 2.42], ["d", 2.13, 2.42, 1.63, 2.54], ["d", 1.63, 2.54, 1.21, 2.78], ["d", 1.21, 2.78, 0.94, 3.09], ["d", 0.94, 3.09, 0.85, 3.45], ["d", 0.85, 3.45, 0.94, 3.81], ["d", 0.94, 3.81, 1.21, 4.12], ["d", 1.21, 4.12, 1.63, 4.36], ["d", 1.63, 4.36, 2.13, 4.48], ["d", 2.13, 4.48, 2.4, 4.5], ["d", 2.4, 4.5, 2.95, 4.61], ["d", 2.95, 4.61, 3.43, 4.8], ["d", 3.43, 4.8, 3.79, 5.07], ["d", 3.79, 5.07, 3.98, 5.42], ["d", 3.98, 5.42, 3.98, 5.78], ["d", 3.98, 5.78, 3.79, 6.12], ["d", 3.79, 6.12, 3.43, 6.4], ["d", 3.43, 6.4, 2.95, 6.59], ["d", 2.95, 6.59, 2.4, 6.65], ["d", 2.4, 6.65, 1.85, 6.59], ["d", 1.85, 6.59, 1.37, 6.4], ["d", 1.37, 6.4, 1.01, 6.12], ["d", 1.01, 6.12, 0.82, 5.78]] },
  t: { w: 3.4, p: [["v", 1.7, 1.2, 7], ["h", 2.6, 0.7, 3.1], ["h", 6.6, 0.7, 2.5]] },
  u: { w: 5.4, p: [["v", 0.9, 2, 6.6], ["v", 4.5, 2, 6.6], ["h", 6.6, 0.9, 4.5]] },
  v: { w: 5.2, p: [["d", 0.4, 2, 2.6, 7], ["d", 2.6, 7, 4.8, 2]] },
  w: { w: 7.4, p: [["d", 0.4, 2, 1.85, 7], ["d", 1.85, 7, 3.7, 2], ["d", 3.7, 2, 5.55, 7], ["d", 5.55, 7, 7.0, 2]] },
  x: { w: 5.2, p: [["d", 0.4, 2, 4.8, 7], ["d", 4.8, 2, 0.4, 7]] },
  y: { w: 5.2, p: [["d", 0.4, 2, 2.6, 5.2], ["d", 4.8, 2, 2.6, 5.2], ["v", 2.6, 5.2, 8.8], ["h", 8.8, 1.1, 2.6], ["d", 1.1, 8.8, 0.6, 7.6]] },
  z: { w: 4.8, p: [["h", 2.4, 0.8, 4.2], ["d", 4.2, 2.4, 0.8, 6.6], ["h", 6.6, 0.8, 4.2]] },
  "0": { w: 5.4, p: [["o", 2.7, 3.5, 2.1, 3.0]] },
  "1": { w: 3.2, p: [["d", 0.8, 1.4, 1.6, 0.4], ["v", 1.6, 0.4, 7], ["h", 6.6, 0.5, 2.7]] },
  "2": { w: 5.2, p: [["h", 0.4, 1.2, 4.2], ["d", 4.2, 0.4, 4.8, 1.8], ["v", 4.8, 1.8, 3.4], ["d", 4.8, 3.4, 0.8, 6.6], ["h", 6.6, 0.8, 4.8]] },
  "3": { w: 5.2, p: [["h", 0.4, 1.0, 4.4], ["h", 3.5, 1.0, 4.4], ["h", 6.6, 1.0, 4.4], ["v", 4.4, 0.4, 3.5], ["v", 4.4, 3.5, 6.6]] },
  "4": { w: 5.4, p: [["d", 3.4, 0, 0.8, 5.0], ["h", 5.0, 0.8, 4.8], ["v", 3.4, 0, 7]] },
  "5": { w: 5.2, p: [["h", 0.4, 0.8, 4.6], ["v", 0.8, 0.4, 3.5], ["h", 3.5, 0.8, 4.4], ["v", 4.4, 3.5, 6.6], ["h", 6.6, 0.8, 4.4]] },
  "6": { w: 5.2, p: [["d", 0.8, 5.4, 2.1, 1.0], ["h", 1.0, 1.2, 3.0], ["o", 2.6, 5.2, 1.8, 1.7]] },
  "7": { w: 5.2, p: [["h", 0.4, 0.8, 4.8], ["d", 4.8, 0.4, 2.1, 7]] },
  "8": { w: 5.4, p: [["o", 2.7, 2.2, 1.8, 1.7], ["o", 2.7, 5.2, 1.8, 1.7]] },
  "9": { w: 5.2, p: [["o", 2.6, 2.2, 1.8, 1.7], ["v", 4.4, 0.4, 7]] },
  ".": { w: 2.4, p: [["f", 1.2, 6.6, 0.5, 0.5]] },
  ",": { w: 2.4, p: [["f", 1.2, 6.6, 0.5, 0.5], ["d", 1.5, 6.8, 0.7, 8.4]] },
  ":": { w: 2.4, p: [["f", 1.2, 2.8, 0.5, 0.5], ["f", 1.2, 6.4, 0.5, 0.5]] },
  ";": { w: 2.4, p: [["f", 1.2, 2.8, 0.5, 0.5], ["f", 1.2, 6.4, 0.5, 0.5], ["d", 1.5, 6.6, 0.7, 8.2]] },
  $: { w: 5.4, p: [["d", 4.54, 1.42, 4.23, 0.95], ["d", 4.23, 0.95, 3.75, 0.61], ["d", 3.75, 0.61, 3.16, 0.42], ["d", 3.16, 0.42, 2.54, 0.42], ["d", 2.54, 0.42, 1.95, 0.61], ["d", 1.95, 0.61, 1.47, 0.95], ["d", 1.47, 0.95, 1.16, 1.42], ["d", 1.16, 1.42, 1.05, 1.95], ["d", 1.05, 1.95, 1.16, 2.48], ["d", 1.16, 2.48, 1.47, 2.95], ["d", 1.47, 2.95, 1.95, 3.29], ["d", 1.95, 3.29, 2.54, 3.48], ["d", 2.54, 3.48, 2.85, 3.5], ["d", 2.85, 3.5, 3.52, 3.5], ["d", 3.52, 3.5, 4.1, 3.77], ["d", 4.1, 3.77, 4.54, 4.2], ["d", 4.54, 4.2, 4.77, 4.72], ["d", 4.77, 4.72, 4.77, 5.28], ["d", 4.77, 5.28, 4.54, 5.8], ["d", 4.54, 5.8, 4.1, 6.23], ["d", 4.1, 6.23, 3.52, 6.5], ["d", 3.52, 6.5, 2.85, 6.6], ["d", 2.85, 6.6, 2.18, 6.5], ["d", 2.18, 6.5, 1.6, 6.23], ["d", 1.6, 6.23, 1.16, 5.8], ["d", 1.16, 5.8, 0.93, 5.28], ["v", 2.7, -0.6, 7.6]] },
  "&": { w: 5.8, p: [["o", 2.1, 4.6, 1.4, 1.4], ["d", 4.2, 1.8, 0.8, 7.4], ["d", 0.8, 7.4, 2.5, 5.4]] },
  "-": { w: 3.2, p: [["h", 3.8, 0.6, 2.6]] },
  "•": { w: 2.8, p: [["f", 1.4, 4.0, 0.8, 0.8]] },
  "°": { w: 2.8, p: [["o", 1.4, 0.9, 0.85, 0.85]] },
  "’": { w: 2.2, p: [["d", 1.5, 0.6, 0.8, 2.2]] },
  "(": { w: 2.6, p: [["d", 2.1, 0.4, 0.9, 2.2], ["v", 0.9, 2.2, 4.8], ["d", 0.9, 4.8, 2.1, 6.6]] },
  ")": { w: 2.6, p: [["d", 0.5, 0.4, 1.7, 2.2], ["v", 1.7, 2.2, 4.8], ["d", 1.7, 4.8, 0.5, 6.6]] },
  "!": { w: 2.4, p: [["v", 1.2, 0, 5.2], ["f", 1.2, 6.6, 0.5, 0.5]] },
  "?": { w: 4.8, p: [["h", 0.6, 1.2, 4.0], ["d", 4.0, 0.6, 4.6, 2.0], ["v", 4.6, 2.0, 3.4], ["d", 4.6, 3.4, 2.7, 5.0], ["f", 2.7, 6.6, 0.5, 0.5]] },
  "—": { w: 5.6, p: [["h", 3.8, 0.4, 5.2]] },
  '"': { w: 3.4, p: [["d", 1.0, 0.4, 0.6, 2.0], ["d", 2.4, 0.4, 2.0, 2.0]] },
  "/": { w: 3.0, p: [["d", 2.4, 0, 0.6, 7]] },
  "+": { w: 4.6, p: [["v", 2.3, 0.8, 6.2], ["h", 3.5, 0.6, 4.0]] },
  "=": { w: 4.6, p: [["h", 2.6, 0.6, 4.0], ["h", 4.8, 0.6, 4.0]] },
  " ": { w: 2.6, p: [] },
};

// ---------------------------------------------------------------- fonts
// tv: vertical-stem thickness (units), th: horizontal-stroke thickness,
// serif: add foot bars to vertical-stem ends, xScale: horizontal condense.
type Font = { tv: number; th: number; serif: boolean; xScale: number; serifW: number; serifT: number };
const DISPLAY: Font = { tv: 1.0, th: 0.4, serif: true, xScale: 0.85, serifW: 1.7, serifT: 0.4 };
const HEADLINE: Font = { tv: 0.85, th: 0.4, serif: true, xScale: 0.82, serifW: 1.6, serifT: 0.35 };
const BODY: Font = { tv: 0.62, th: 0.34, serif: true, xScale: 0.8, serifW: 1.6, serifT: 0.32 };
const SANS: Font = { tv: 0.8, th: 0.8, serif: false, xScale: 0.85, serifW: 0, serifT: 0 };

function shearPts(pts: Pt[], baseY: number, k: number): Pt[] {
  if (!k) return pts;
  return pts.map(([x, y]): Pt => [x + (baseY - y) * k, y]);
}

function drawGlyph(
  ch: string,
  x: number,
  baseY: number,
  scale: number,
  font: Font,
  c: Color,
  italic: boolean,
): number {
  const g = GLYPHS[ch];
  if (!g) return 3.3 * scale * font.xScale;
  const sx = scale * font.xScale;
  const sy = scale;
  // Side bearing: every glyph is drawn 0.35 units in from its advance box so
  // neighbouring letters never touch, and the advance grows by 0.7 units.
  const BEAR = 0.35;
  const py = (u: number): number => baseY - (7 - u) * sy;
  const px = (u: number): number => x + (u + BEAR) * sx;
  const shear = italic ? 0.16 : 0;
  const tv = font.tv;
  const th = font.th;
  for (const part of g.p) {
    if (part[0] === "v") {
      const [, gx, y0, y1] = part;
      const hw = (tv * sx) / 2;
      fillPoly(
        shearPts(
          [
            [px(gx) - hw, py(y0)],
            [px(gx) + hw, py(y0)],
            [px(gx) + hw, py(y1)],
            [px(gx) - hw, py(y1)],
          ],
          baseY,
          shear,
        ),
        c,
      );
      if (font.serif) {
        const fw = (font.serifW * tv * sx) / 2;
        const ft = (font.serifT * sy) / 2;
        const fx0 = Math.max(px(0.05), px(gx) - fw);
        const fx1 = Math.min(px(g.w - 0.05), px(gx) + fw);
        for (const ye of [y0, y1]) {
          if (ye <= 2.3 || ye >= 6.7) {
            fillPoly(
              shearPts(
                [
                  [fx0, py(ye) - ft],
                  [fx1, py(ye) - ft],
                  [fx1, py(ye) + ft],
                  [fx0, py(ye) + ft],
                ],
                baseY,
                shear,
              ),
              c,
            );
          }
        }
      }
    } else if (part[0] === "h") {
      const [, gy, x0, x1] = part;
      const hh = (th * sy) / 2;
      fillPoly(
        shearPts(
          [
            [px(x0), py(gy) - hh],
            [px(x1), py(gy) - hh],
            [px(x1), py(gy) + hh],
            [px(x0), py(gy) + hh],
          ],
          baseY,
          shear,
        ),
        c,
      );
    } else if (part[0] === "d") {
      const [, x0, y0, x1, y1] = part;
      const quad = lineQuad(px(x0), py(y0), px(x1), py(y1), tv * sx);
      fillPoly(shearPts(quad, baseY, shear), c);
    } else if (part[0] === "o") {
      const [, cx, cy, rx, ry] = part;
      const outer = octPts(px(cx), py(cy), rx * sx, ry * sy);
      const inner = octPts(px(cx), py(cy), Math.max(0.1, rx - tv) * sx, Math.max(0.1, ry - tv) * sy);
      fillPolysEvenOdd([shearPts(outer, baseY, shear), shearPts(inner, baseY, shear)], c);
    } else {
      const [, cx, cy, rx, ry] = part;
      fillPoly(shearPts(octPts(px(cx), py(cy), rx * sx, ry * sy), baseY, shear), c);
    }
  }
  return (g.w + 0.7) * sx;
}

function measure(text: string, font: Font, capH: number, tracking = 0): number {
  const scale = capH / 7;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS[text[i]];
    w += (g ? g.w + 0.7 : 3.3) * scale * font.xScale;
    if (i < text.length - 1) w += tracking;
  }
  return w;
}

type TextOpts = { align?: "left" | "center" | "right"; tracking?: number; italic?: boolean };

function drawText(
  text: string,
  x: number,
  baseY: number,
  font: Font,
  capH: number,
  c: Color,
  opts: TextOpts = {},
): void {
  const tracking = opts.tracking ?? 0;
  const w = measure(text, font, capH, tracking);
  let cx = x;
  if (opts.align === "center") cx = x - w / 2;
  if (opts.align === "right") cx = x - w;
  const scale = capH / 7;
  for (let i = 0; i < text.length; i++) {
    cx += drawGlyph(text[i], cx, baseY, scale, font, c, !!opts.italic);
    if (i < text.length - 1) cx += tracking;
  }
}

// Fit one line to a target width; returns the cap height used.
function drawFit(
  text: string,
  x: number,
  baseY: number,
  font: Font,
  targetW: number,
  c: Color,
  opts: TextOpts = {},
): number {
  const w7 = measure(text, font, 7, opts.tracking ?? 0);
  const capH = (targetW / w7) * 7;
  drawText(text, x, baseY, font, capH, c, opts);
  return capH;
}

// Draw several lines at one shared cap height (taken from the longest line's
// fit, optionally capped), so a short line never balloons up into the line
// above it. Lines are centred on cx; baselines start at y0, spaced by gap.
function drawFitLines(
  lines: string[],
  cx: number,
  y0: number,
  font: Font,
  targetW: number,
  c: Color,
  gap: number,
  maxCap = Infinity,
): void {
  let capH = maxCap;
  for (const line of lines) {
    const w7 = measure(line, font, 7);
    capH = Math.min(capH, (targetW / w7) * 7);
  }
  let y = y0;
  for (const line of lines) {
    drawText(line, cx, y, font, capH, c, { align: "center" });
    y += gap;
  }
}

function wrapLines(text: string, font: Font, capH: number, maxW: number, tracking = 0): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? cur + " " + word : word;
    if (measure(next, font, capH, tracking) <= maxW || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- illustrations
function halftoneDots(x0: number, y0: number, x1: number, y1: number, gap: number, r: number, c: Color): void {
  for (let y = y0 + gap / 2; y < y1; y += gap) {
    for (let x = x0 + gap / 2; x < x1; x += gap) {
      disc(x, y, r, c);
    }
  }
}

function skyline(x0: number, x1: number, baseY: number): void {
  const heights = [62, 44, 78, 52, 96, 58, 40, 88, 66, 48, 104, 60, 42, 82, 56, 70, 46, 92, 64, 50];
  const widths = [34, 28, 40, 30, 36, 26, 32, 38, 30, 28, 42, 30, 26, 36, 30, 34, 28, 38, 32, 30];
  let x = x0;
  let i = 0;
  while (x < x1 - 20) {
    const w = widths[i % widths.length];
    const h = heights[i % heights.length];
    rect(x, baseY - h, x + w, baseY, INK);
    // lit windows
    const rnd = mulberry32(1000 + i * 17);
    for (let wy = baseY - h + 8; wy < baseY - 8; wy += 12) {
      for (let wx = x + 6; wx < x + w - 6; wx += 10) {
        if (rnd() < 0.45) rect(wx, wy, wx + 3.5, wy + 4.5, CREAM);
      }
    }
    x += w + 3;
    i++;
  }
}

function sun(cx: number, cy: number, r: number): void {
  disc(cx, cy, r, RED);
  // white stripes clipped to the disc by chord width
  const stripes = [-r * 0.45, -r * 0.1, r * 0.25];
  for (const dy of stripes) {
    const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
    rect(cx - hw, cy + dy - 3, cx + hw, cy + dy + 3, CREAM);
  }
}

function palm(x: number, baseY: number, h: number, lean: number): void {
  const topX = x + lean;
  const topY = baseY - h;
  thickLine(x, baseY, topX, topY, 4, INK);
  const fronds: [number, number][] = [
    [-34, -6],
    [-26, -22],
    [-8, -30],
    [12, -26],
    [30, -12],
    [36, 4],
  ];
  for (const [dx, dy] of fronds) {
    thickLine(topX, topY, topX + dx, topY + dy, 3, INK);
  }
}

function bird(x: number, y: number, s: number): void {
  thickLine(x - s, y - s * 0.5, x, y, 2.5, INK);
  thickLine(x, y, x + s, y - s * 0.5, 2.5, INK);
}

function car(x: number, y: number): void {
  // white car, side view, facing left
  rect(x, y - 14, x + 86, y, CREAM);
  fillPoly(
    [
      [x + 16, y - 14],
      [x + 26, y - 26],
      [x + 62, y - 26],
      [x + 72, y - 14],
    ],
    CREAM,
  );
  rect(x + 28, y - 24, x + 40, y - 15, INK);
  rect(x + 46, y - 24, x + 60, y - 15, INK);
  disc(x + 18, y - 2, 7, INK);
  disc(x + 68, y - 2, 7, INK);
  disc(x + 18, y - 2, 3, CREAM);
  disc(x + 68, y - 2, 3, CREAM);
}

function chart(x: number, y: number, w: number, h: number): void {
  const bars = [0.32, 0.55, 0.85];
  const bw = w / 5;
  bars.forEach((f, i) => {
    const bx = x + i * (bw * 1.6);
    rect(bx, y + h - h * f, bx + bw, y + h, INK);
  });
  thickLine(x - 4, y + h * 0.62, x + w, y + h * 0.08, 3.5, RED);
  fillPoly(
    [
      [x + w, y + h * 0.08],
      [x + w - 12, y + h * 0.08 - 2],
      [x + w - 12, y + h * 0.08 + 8],
    ],
    RED,
  );
}

function globe(cx: number, cy: number, r: number): void {
  ellipseRing(cx, cy, r, r, 2.5, INK);
  ellipseRing(cx, cy, r * 0.45, r, 2, INK);
  ellipseRing(cx, cy, r, r * 0.45, 2, INK);
  thickLine(cx - r * 0.8, cy + r * 0.55, cx + r * 0.85, cy - r * 0.6, 2.5, TEAL);
  thickLine(cx - r * 0.85, cy - r * 0.45, cx + r * 0.8, cy + r * 0.65, 2.5, TEAL);
  disc(cx + r * 0.25, cy - r * 0.1, 3, RED);
}

function dome(cx: number, baseY: number, w: number): void {
  const r = w / 2;
  const pts: Pt[] = [[cx - r, baseY]];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (k * Math.PI) / 12;
    pts.push([cx + r * Math.cos(a), baseY - r * 0.85 * Math.sin(a)]);
  }
  pts.push([cx + r, baseY]);
  fillPoly(pts, INK);
  rect(cx - r * 0.8, baseY - 6, cx + r * 0.8, baseY, INK);
  for (let i = -2; i <= 2; i++) {
    rect(cx + i * (r / 3) - 2.5, baseY - 22, cx + i * (r / 3) + 2.5, baseY - 6, INK);
  }
  rect(cx - r * 0.9, baseY - 26, cx + r * 0.9, baseY - 22, INK);
  vline(cx, baseY - r * 0.85 - 18, baseY - r * 0.85, 2, INK);
  fillPoly(
    [
      [cx, baseY - r * 0.85 - 18],
      [cx + 12, baseY - r * 0.85 - 14],
      [cx, baseY - r * 0.85 - 10],
    ],
    RED,
  );
}

function rocket(x: number, y: number): void {
  // diagonal capsule, nose up-right
  const body: Pt[] = [
    [x, y + 34],
    [x + 12, y + 8],
    [x + 30, y - 6],
    [x + 42, y + 2],
    [x + 30, y + 28],
    [x + 14, y + 42],
  ];
  fillPoly(body, INK);
  disc(x + 22, y + 12, 5, CREAM);
  disc(x + 22, y + 12, 2, RED);
  disc(x + 4, y + 38, 3, RED);
  disc(x + 10, y + 44, 2.5, RED);
  disc(x + 16, y + 48, 2, RED);
}

function cyclone(cx: number, cy: number, r: number): void {
  for (const [rr, a0, a1] of [
    [r, 0.3, 4.4],
    [r * 0.68, 1.2, 5.3],
    [r * 0.38, 2.2, 6.0],
  ] as [number, number, number][]) {
    let px0 = cx + rr * Math.cos(a0);
    let py0 = cy + rr * Math.sin(a0) * 0.85;
    for (let a = a0 + 0.35; a <= a1; a += 0.35) {
      const px1 = cx + rr * Math.cos(a);
      const py1 = cy + rr * Math.sin(a) * 0.85;
      thickLine(px0, py0, px1, py1, 3, INK);
      px0 = px1;
      py0 = py1;
    }
  }
  disc(cx, cy, 4, RED);
  thickLine(cx - r - 6, cy + r * 0.8, cx - r + 2, cy + r * 0.55, 2.5, INK);
  thickLine(cx - r + 2, cy + r * 0.95, cx - r + 10, cy + r * 0.7, 2.5, INK);
}

// ---------------------------------------------------------------- page
function drawPage(): void {
  // borders
  rect(10, 10, 1014, 12.5, INK);
  rect(10, 1011.5, 1014, 1014, INK);
  rect(10, 10, 12.5, 1014, INK);
  rect(1011.5, 10, 1014, 1014, INK);
  rect(17, 17, 1007, 18.2, INK);
  rect(17, 1005.8, 1007, 1007, INK);
  rect(17, 17, 18.2, 1007, INK);
  rect(1005.8, 17, 1007, 1007, INK);

  // masthead — Didone display face
  drawFit("THE WORLD BULLETIN", 512, 116, DISPLAY, 952, INK, { align: "center" });
  hline(26, 998, 128, 1.6, INK);
  hline(26, 998, 133, 1, INK);

  // dateline
  drawText("No. 001", 30, 157, SANS, 19, INK);
  drawText("THURSDAY, 19 NOVEMBER 2026", 512, 157, SANS, 19, INK, { align: "center" });
  hline(26, 998, 167, 1, INK);

  // weather strip
  drawText("WEATHER: VICE CITY 28° CLEAR • NEW YORK 12° • LONDON 9°", 30, 190, SANS, 16, TEAL);
  drawText("OPINION: THE DAY GAMES GREW UP", 994, 190, SANS, 16, INK, { align: "right" });
  hline(26, 998, 200, 1, INK);

  // kicker + lead headline — bold serif
  drawText("VICE CITY AWAITS • OUT TODAY", 30, 228, SANS, 21, RED);
  drawFitLines(["GTA VI LAUNCHES", "WORLDWIDE"], 512, 322, HEADLINE, 950, INK, 102);

  // deck — light serif, italic
  drawFit(
    "Gamers enter Vice City as the biggest game launch in history rolls out across the world today.",
    512,
    456,
    BODY,
    950,
    INK,
    { align: "center", italic: true },
  );

  // lead illustration
  rect(30, 472, 994, 473.5, INK);
  rect(30, 612.5, 994, 614, INK);
  rect(30, 472, 31.5, 614, INK);
  rect(992.5, 472, 994, 614, INK);
  halftoneDots(34, 476, 990, 502, 13, 2.1, RED);
  sun(858, 548, 50);
  skyline(36, 988, 614);
  car(618, 606);
  palm(52, 612, 96, 14);
  palm(948, 612, 88, -12);
  bird(420, 516, 9);
  bird(560, 502, 7);

  // caption — light serif, italic
  drawFit(
    "Sunset over Vice City: Players take to the streets as the game opens worldwide today.",
    512,
    640,
    BODY,
    950,
    INK,
    { align: "center", italic: true },
  );
  hline(26, 998, 652, 1.6, INK);

  // three columns
  const cols: { x0: number; x1: number; label: string; head: string; body: string }[] = [
    {
      x0: 30,
      x1: 338,
      label: "TECHNOLOGY",
      head: "Anthropic IPO: $81.3bn",
      body: "Biggest stock market debut ever.",
    },
    {
      x0: 358,
      x1: 666,
      label: "DIPLOMACY",
      head: "Trump, Xi Jinping & Putin Meet",
      body: "Trilateral talks in Shenzhen, China.",
    },
    {
      x0: 686,
      x1: 994,
      label: "POLITICS",
      head: "Jeffries Makes History",
      body: "First Black nominee for US House Speaker.",
    },
  ];
  vline(348, 664, 868, 1, INK);
  vline(676, 664, 868, 1, INK);
  cols.forEach((col, i) => {
    drawText(col.label, col.x0, 684, SANS, 18, RED);
    if (i === 0) chart(col.x0 + 8, 694, 150, 52);
    if (i === 1) globe((col.x0 + col.x1) / 2, 722, 26);
    if (i === 2) dome((col.x0 + col.x1) / 2, 748, 74);
    const lines = wrapLines(col.head, HEADLINE, 28, col.x1 - col.x0);
    drawFitLines(lines, (col.x0 + col.x1) / 2, 776, HEADLINE, col.x1 - col.x0, INK, 40, 28);
    const bodyLines = wrapLines(col.body, BODY, 18, col.x1 - col.x0);
    let y = 842;
    for (const line of bodyLines) {
      drawText(line, col.x0, y, BODY, 18, INK);
      y += 22;
    }
  });
  hline(26, 998, 876, 1.6, INK);

  // bottom row
  vline(522, 886, 960, 1, INK);
  drawText("SPACE", 30, 904, SANS, 17, RED);
  rocket(52, 912);
  drawFit("Voyager 1: One Light-Day", 170, 932, HEADLINE, 330, INK);
  drawText("Farthest human object, 50 years on.", 170, 954, BODY, 16, INK);
  drawText("WEATHER", 536, 904, SANS, 17, RED);
  cyclone(596, 932, 24);
  drawFit("Cyclone Akvan Nears India", 660, 932, HEADLINE, 330, INK);
  drawText("50,000 evacuated in Odisha.", 660, 954, BODY, 16, INK);

  // footer
  hline(26, 998, 970, 1, INK);
  drawText(
    "All six stories first reported on 19 November 2026 • The World Bulletin • Page 1",
    512,
    992,
    BODY,
    14,
    INK,
    { align: "center" },
  );
}

// ---------------------------------------------------------------- PNG
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function pngEncode(): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  drawPage();
  const png = pngEncode();
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`entry.png ${png.length} bytes sha256 ${sha} -> ${outPath}`);
}

main();

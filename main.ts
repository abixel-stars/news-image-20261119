// The World Bulletin - front page for 19 November 2026.
// Pure Node 22 standard library only. No child processes, no network,
// no external files. Every glyph and every texture is drawn from code.
// Output: one 1024x1024 PNG, byte-identical on every run.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const PAPER: RGB = [246, 239, 221];
const INK: RGB = [26, 26, 26];
const RED: RGB = [205, 56, 32];
const TEAL: RGB = [13, 122, 113];
const CREAM: RGB = [250, 248, 240];
const GRAIN: RGB = [122, 96, 58];

type RGB = [number, number, number];

// Deterministic PRNG (mulberry32), fixed seed: same output every run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- PNG writer (RGB, 8 bit, no filter) ----
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Canvas ----
class Canvas {
  data = new Uint8Array(W * H * 3);
  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.data[i * 3] = PAPER[0];
      this.data[i * 3 + 1] = PAPER[1];
      this.data[i * 3 + 2] = PAPER[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const o = (yi * W + xi) * 3;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const o = (yi * W + xi) * 3;
    this.data[o] = Math.round(this.data[o] * (1 - a) + c[0] * a);
    this.data[o + 1] = Math.round(this.data[o + 1] * (1 - a) + c[1] * a);
    this.data[o + 2] = Math.round(this.data[o + 2] * (1 - a) + c[2] * a);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * W + xx) * 3;
        this.data[o] = c[0];
        this.data[o + 1] = c[1];
        this.data[o + 2] = c[2];
      }
    }
  }
  hline(x0: number, x1: number, y: number, t: number, c: RGB): void {
    this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0), t, c);
  }
  vline(x: number, y0: number, y1: number, t: number, c: RGB): void {
    this.rect(x, Math.min(y0, y1), t, Math.abs(y1 - y0), c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const half = Math.floor(t / 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      this.rect(x - half, y - half, t, t, c);
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) {
      const dy = y - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      this.rect(cx - half, y, half * 2, 1, c);
    }
  }
  circleOutline(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      this.rect(cx + Math.cos(rad) * r - t / 2, cy + Math.sin(rad) * r - t / 2, t, t, c);
    }
  }
  ellipseOutline(cx: number, cy: number, rx: number, ry: number, rot: number, c: RGB, t = 2): void {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      const ex = Math.cos(rad) * rx;
      const ey = Math.sin(rad) * ry;
      const x = cx + ex * cos - ey * sin;
      const y = cy + ex * sin + ey * cos;
      this.rect(x - t / 2, y - t / 2, t, t, c);
    }
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB, t = 2): void {
    for (let a = a0; a <= a1; a += 1) {
      const rad = (a * Math.PI) / 180;
      this.rect(cx + Math.cos(rad) * r - t / 2, cy + Math.sin(rad) * r - t / 2, t, t, c);
    }
  }
  fillPoly(pts: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        this.rect(xs[i], y, xs[i + 1] - xs[i], 1, c);
      }
    }
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
    this.rect(x + r, y, w - 2 * r, h, c);
    this.rect(x, y + r, w, h - 2 * r, c);
    this.fillCircle(x + r, y + r, r, c);
    this.fillCircle(x + w - r, y + r, r, c);
    this.fillCircle(x + r, y + h - r, r, c);
    this.fillCircle(x + w - r, y + h - r, r, c);
  }
}

// ---- Bitmap font: 5 columns x 7 rows per glyph, drawn from code ----
type Glyph = string[];
const FONT: Record<string, Glyph> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
};

// Lowercase and punctuation glyphs (same 5x7 grid).
const FONT_LOWER: Record<string, Glyph> = {
  a: [".....", ".....", ".####", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", ".#...", "####.", ".#...", ".#...", ".#..."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: [".....", "..#..", ".....", ".##..", "..#..", "..#..", ".###."],
  j: [".....", "...#.", ".....", "..##.", "...#.", "...#.", "##..."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", "####.", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".####", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#...", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  $: ["..#..", ".####", "#.#.#", ".#...", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "-": [".....", ".....", ".....", ".####", ".....", ".....", "....."],
  "\u00b0": [".###.", "#...#", ".###.", ".....", ".....", ".....", "....."],
  "\u00b7": [".....", ".....", ".....", ".##..", ".##..", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};
for (const k of Object.keys(FONT_LOWER)) FONT[k] = FONT_LOWER[k];

interface TextOpts {
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
}

function textWidth(s: string, cw: number): number {
  return Math.max(0, (s.length * 6 - 1) * cw);
}

// Draw one string. (x, y) is the top-left of the text box; align moves it
// horizontally around x. cw = cell width, ch = cell height (may be fractional).
function drawText(cv: Canvas, s: string, x: number, y: number, cw: number, ch: number, c: RGB, opts: TextOpts = {}): void {
  const w = textWidth(s, cw);
  let x0 = x;
  if (opts.align === "center") x0 = x - w / 2;
  if (opts.align === "right") x0 = x - w;
  const boldExtra = opts.bold ? Math.max(0.6, cw * 0.28) : 0;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]];
    if (!g) continue;
    const gx = x0 + i * 6 * cw;
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      const shear = opts.italic ? (6 - r) * ch * 0.14 : 0;
      for (let col = 0; col < 5; col++) {
        if (row[col] !== "#") continue;
        const px = gx + col * cw + shear;
        const py = y + r * ch;
        const x1 = Math.round(px + cw + boldExtra);
        const y1 = Math.round(py + ch);
        cv.rect(Math.round(px), Math.round(py), Math.max(1, x1 - Math.round(px)), Math.max(1, y1 - Math.round(py)), c);
      }
    }
  }
}

// ---- Page layout ----
function drawPage(): Canvas {
  const cv = new Canvas();

  // Double frame.
  cv.hline(10, 1014, 10, 3, INK);
  cv.hline(10, 1014, 1011, 3, INK);
  cv.vline(10, 10, 1014, 3, INK);
  cv.vline(1011, 10, 1014, 3, INK);
  cv.hline(18, 1006, 18, 1, INK);
  cv.hline(18, 1006, 1005, 1, INK);
  cv.vline(18, 18, 1006, 1, INK);
  cv.vline(1005, 18, 1006, 1, INK);

  // Masthead.
  drawText(cv, "THE WORLD BULLETIN", 512, 40, 9, 13, INK, { bold: true, align: "center" });
  cv.hline(18, 1006, 132, 2, INK);

  // Info row: number left, date centered. No price anywhere.
  drawText(cv, "No. 001", 34, 142, 2.6, 3.2, INK);
  drawText(cv, "THURSDAY, 19 NOVEMBER 2026", 512, 142, 2.8, 3.5, INK, { bold: true, align: "center" });
  cv.hline(18, 1006, 176, 3, INK);
  cv.hline(18, 1006, 182, 1, INK);

  // Weather strip.
  drawText(cv, "WEATHER: VICE CITY 28\u00b0 CLEAR \u00b7 NEW YORK 12\u00b0 \u00b7 LONDON 9\u00b0", 34, 194, 1.8, 2.5, TEAL, { bold: true });
  drawText(cv, "OPINION: THE DAY GAMES GREW UP", 990, 194, 1.8, 2.5, INK, { bold: true, align: "right" });

  // Kicker + headline + deck.
  drawText(cv, "VICE CITY AWAITS \u00b7 OUT TODAY", 34, 224, 2.8, 3.4, RED, { bold: true });
  drawText(cv, "GTA VI LAUNCHES", 34, 248, 10, 13, INK, { bold: true });
  drawText(cv, "WORLDWIDE", 34, 344, 10, 13, INK, { bold: true });
  drawText(cv, "Gamers enter Vice City as the biggest game launch in history rolls out across the world today.", 34, 446, 1.6, 3.6, INK, { italic: true });

  // ---- Main illustration panel ----
  const px0 = 34;
  const px1 = 990;
  const py0 = 492;
  const py1 = 628;
  cv.hline(px0, px1, py0, 2, INK);
  cv.hline(px0, px1, py1 - 2, 2, INK);
  cv.vline(px0, py0, py1, 2, INK);
  cv.vline(px1 - 2, py0, py1, 2, INK);
  // Halftone red dots in the sky.
  for (let row = 0; row < 5; row++) {
    const y = 502 + row * 9;
    const off = row % 2 === 0 ? 0 : 6;
    for (let x = 44 + off; x < 880; x += 12) {
      cv.fillCircle(x, y, 2, RED);
    }
  }
  // Red sun with three cream stripes, upper right.
  const sunX = 872;
  const sunY = 548;
  const sunR = 46;
  cv.fillCircle(sunX, sunY, sunR, RED);
  for (const sy of [530, 542, 554]) {
    const dy = sy + 2.5 - sunY;
    const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
    cv.rect(sunX - half, sy, half * 2, 5, CREAM);
  }
  // Black skyline with lit cream windows.
  const rng = mulberry32(7);
  const buildings: Array<[number, number, number]> = [
    [36, 40, 560], [78, 34, 585], [114, 46, 548], [162, 30, 592], [194, 52, 566],
    [248, 36, 600], [286, 44, 556], [332, 30, 590], [364, 50, 572], [416, 34, 598],
    [452, 48, 560], [502, 30, 586], [534, 52, 568], [588, 36, 596], [626, 46, 556],
    [674, 30, 590], [706, 48, 574], [756, 34, 600], [792, 44, 564], [838, 30, 592],
    [870, 50, 570], [922, 34, 596], [958, 30, 578],
  ];
  for (const b of buildings) {
    cv.rect(b[0], b[2], b[1], py1 - 2 - b[2], INK);
    for (let wy = b[2] + 9; wy < py1 - 12; wy += 12) {
      for (let wx = b[0] + 6; wx < b[0] + b[1] - 6; wx += 10) {
        if (rng() < 0.45) cv.rect(wx, wy, 3, 5, CREAM);
      }
    }
  }
  // White car on the street.
  cv.roundRect(620, 600, 92, 16, 5, CREAM);
  cv.roundRect(646, 588, 44, 14, 5, CREAM);
  cv.rect(652, 591, 14, 8, INK);
  cv.rect(670, 591, 14, 8, INK);
  cv.fillCircle(642, 616, 6, INK);
  cv.fillCircle(692, 616, 6, INK);
  cv.fillCircle(642, 616, 2, CREAM);
  cv.fillCircle(692, 616, 2, CREAM);
  // Palm trees at both edges.
  cv.line(60, 626, 52, 540, INK, 4);
  for (const f of [[16, 556], [26, 538], [50, 524], [76, 536], [90, 556]]) {
    cv.line(52, 540, f[0], f[1], INK, 3);
  }
  cv.line(962, 626, 968, 542, INK, 4);
  for (const f of [[928, 556], [940, 538], [962, 526], [984, 538], [986, 556]]) {
    cv.line(968, 542, f[0], f[1], INK, 3);
  }
  // Two small birds.
  cv.line(362, 540, 370, 546, INK, 2);
  cv.line(370, 546, 378, 540, INK, 2);
  cv.line(592, 528, 600, 534, INK, 2);
  cv.line(600, 534, 608, 528, INK, 2);

  // Caption + rule.
  drawText(cv, "Sunset over Vice City: players take to the streets as the game opens worldwide today.", 34, 640, 1.75, 3, INK, { italic: true });
  cv.hline(18, 1006, 666, 2, INK);

  // ---- Three columns ----
  cv.vline(348, 682, 894, 1, INK);
  cv.vline(676, 682, 894, 1, INK);

  // Column 1: technology, bar chart.
  drawText(cv, "TECHNOLOGY", 34, 680, 2.2, 2.6, RED, { bold: true });
  cv.rect(48, 752, 34, 24, INK);
  cv.rect(96, 732, 34, 44, INK);
  cv.rect(144, 712, 34, 64, INK);
  cv.line(44, 770, 296, 700, RED, 3);
  cv.line(296, 700, 280, 702, RED, 3);
  cv.line(296, 700, 290, 716, RED, 3);
  drawText(cv, "Anthropic IPO:", 34, 784, 3, 5.3, INK, { bold: true });
  drawText(cv, "$81.3bn", 34, 822, 3, 5.3, INK, { bold: true });
  drawText(cv, "Biggest stock market debut ever.", 34, 862, 1.5, 2.6, INK);

  // Column 2: diplomacy, globe.
  drawText(cv, "DIPLOMACY", 360, 680, 2.2, 2.6, RED, { bold: true });
  cv.circleOutline(438, 738, 34, INK, 2);
  cv.ellipseOutline(438, 738, 34, 13, 0, INK, 1);
  cv.ellipseOutline(438, 738, 13, 34, 0, INK, 1);
  cv.fillCircle(428, 726, 3, RED);
  cv.fillCircle(452, 748, 3, RED);
  cv.fillCircle(420, 752, 3, RED);
  cv.ellipseOutline(438, 738, 52, 16, -0.5, TEAL, 2);
  drawText(cv, "Trump, Xi Jinping", 360, 784, 3, 5.3, INK, { bold: true });
  drawText(cv, "& Putin Meet", 360, 822, 3, 5.3, INK, { bold: true });
  drawText(cv, "Trilateral talks in Shenzhen,", 360, 862, 1.5, 2.6, INK);
  drawText(cv, "China.", 360, 880, 1.5, 2.6, INK);

  // Column 3: politics, capitol dome.
  drawText(cv, "POLITICS", 688, 680, 2.2, 2.6, RED, { bold: true });
  cv.fillCircle(800, 756, 38, INK);
  cv.rect(760, 756, 80, 22, PAPER);
  cv.vline(800, 700, 720, 2, INK);
  cv.fillPoly([[800, 700], [820, 705], [800, 710]], RED);
  cv.rect(748, 756, 104, 5, INK);
  for (const cx of [756, 776, 796, 816, 836]) cv.rect(cx, 761, 8, 17, INK);
  drawText(cv, "Jeffries Makes", 688, 784, 3, 5.3, INK, { bold: true });
  drawText(cv, "History", 688, 822, 3, 5.3, INK, { bold: true });
  drawText(cv, "First Black nominee for US House", 688, 862, 1.5, 2.6, INK);
  drawText(cv, "Speaker.", 688, 880, 1.5, 2.6, INK);

  cv.hline(18, 1006, 900, 2, INK);

  // ---- Bottom row ----
  cv.vline(516, 912, 968, 1, INK);

  // Left: rocket panel + space story.
  cv.roundRect(34, 916, 128, 48, 10, INK);
  cv.fillPoly([[98, 954], [138, 920], [148, 930], [108, 962]], CREAM);
  cv.fillPoly([[108, 962], [96, 958], [102, 970]], CREAM);
  cv.fillCircle(128, 938, 3, RED);
  cv.fillCircle(88, 958, 2, RED);
  cv.fillCircle(78, 961, 2, RED);
  cv.fillCircle(68, 959, 2, RED);
  drawText(cv, "SPACE", 174, 912, 2.2, 2.4, RED, { bold: true });
  drawText(cv, "Voyager 1: One Light-Day", 174, 932, 2.25, 3.8, INK, { bold: true });
  drawText(cv, "Farthest human object, 50 years on.", 174, 960, 1.5, 2.6, INK);

  // Right: cyclone + weather story.
  cv.arc(598, 938, 8, 20, 300, INK, 2);
  cv.arc(598, 938, 15, 80, 350, INK, 2);
  cv.arc(598, 938, 22, 140, 420, INK, 2);
  cv.arc(598, 938, 29, 200, 480, INK, 2);
  cv.fillCircle(598, 938, 4, RED);
  for (const rx of [568, 588, 608, 628]) cv.line(rx, 962, rx - 8, 976, INK, 2);
  drawText(cv, "WEATHER", 660, 912, 2.2, 2.4, RED, { bold: true });
  drawText(cv, "Cyclone Akvan Nears India", 660, 932, 2.2, 3.8, INK, { bold: true });
  drawText(cv, "50,000 evacuated in Odisha.", 660, 960, 1.5, 2.6, INK);

  // Footer.
  cv.hline(18, 1006, 982, 1, INK);
  drawText(cv, "All six stories first reported on 19 November 2026 \u00b7 The World Bulletin \u00b7 Page 1", 512, 990, 1.5, 2, INK, { align: "center" });

  // Paper grain: 3200 fixed-seed specks over the whole page.
  const grain = mulberry32(20261119);
  for (let i = 0; i < 3200; i++) {
    cv.blend(grain() * W, grain() * H, GRAIN, 0.28);
  }
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "output";
  mkdirSync(outDir, { recursive: true });
  const cv = drawPage();
  const png = encodePng(cv.data, W, H);
  writeFileSync(join(outDir, "entry.png"), png);
}

main();

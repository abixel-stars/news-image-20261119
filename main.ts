// The World Bulletin — front page drawn entirely in code.
// Pure Node 22 standard library only: no child processes, no network,
// no font files. Every letterform is drawn from code by a small
// vector glyph engine, modelled on the classic normal-width bold serif of
// the v2 reference: wide masthead, very bold headlines, readable serif
// body, italic deck and captions, bold sans labels.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- determinism
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ canvas
type RGB = [number, number, number];
const PAPER: RGB = [243, 235, 217];
const INK: RGB = [25, 21, 18];
const RED: RGB = [212, 43, 30];
const TEAL: RGB = [30, 122, 108];
const GRAIN: RGB = [226, 216, 194];
const SPECK: RGB = [90, 76, 58];
const W = 1024;
const H = 1024;

class Canvas {
  buf = new Uint8Array(W * H * 3);
  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = PAPER[0]; this.buf[i * 3 + 1] = PAPER[1]; this.buf[i * 3 + 2] = PAPER[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const o = (yi * W + xi) * 3;
    this.buf[o] = c[0]; this.buf[o + 1] = c[1]; this.buf[o + 2] = c[2];
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const a = Math.max(0, Math.floor(Math.min(x0, x1)));
    const b = Math.min(W - 1, Math.ceil(Math.max(x0, x1)));
    const d = Math.max(0, Math.floor(Math.min(y0, y1)));
    const e = Math.min(H - 1, Math.ceil(Math.max(y0, y1)));
    for (let y = d; y <= e; y++) for (let x = a; x <= b; x++) this.set(x, y, c);
  }
  // Even-odd scanline fill of one or more polygons.
  fillPoly(paths: number[][][], c: RGB): void {
    let minY = Infinity, maxY = -Infinity;
    for (const p of paths) for (const pt of p) { minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]); }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (const p of paths) {
        for (let i = 0; i < p.length; i++) {
          const a = p[i], b = p[(i + 1) % p.length];
          if ((a[1] <= yc && yc < b[1]) || (b[1] <= yc && yc < a[1])) {
            xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, Math.floor(xs[i])), xb = Math.min(W - 1, Math.ceil(xs[i + 1]));
        for (let x = xa; x <= xb; x++) this.set(x, y, c);
      }
    }
  }
  ellipsePoly(cx: number, cy: number, rx: number, ry: number, steps = 40): number[][] {
    const pts: number[][] = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    this.fillPoly([this.ellipsePoly(cx, cy, rx, ry)], c);
  }
  ring(cx: number, cy: number, rx: number, ry: number, w: number, c: RGB): void {
    const irx = Math.max(0.5, rx - w), iry = Math.max(0.5, ry - w);
    this.fillPoly([this.ellipsePoly(cx, cy, rx, ry), this.ellipsePoly(cx, cy, irx, iry)], c);
  }
  // Thick polyline with round joins and caps.
  strokePts(pts: number[][], w: number, c: RGB): void {
    const r = w / 2;
    for (let i = 0; i < pts.length; i++) {
      this.ellipse(pts[i][0], pts[i][1], r, r, c);
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * r, oy = (dx / len) * r;
      this.fillPoly([[[x1 + ox, y1 + oy], [x2 + ox, y2 + oy], [x2 - ox, y2 - oy], [x1 - ox, y1 - oy]]], c);
    }
  }
  arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): number[][] {
    const pts: number[][] = [];
    const step = 4;
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    for (let a = a0; a <= a1 + 0.001; a += step) {
      const rad = (Math.min(a, a1) * Math.PI) / 180;
      pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)]);
    }
    return pts;
  }
  arcStroke(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, c: RGB): void {
    this.strokePts(this.arcPts(cx, cy, rx, ry, a0, a1), w, c);
  }
  line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
    this.strokePts([[x1, y1], [x2, y2]], w, c);
  }
}

// ------------------------------------------------------------- glyph engine
// Glyph space: baseline y = 0, cap height 70, x-height 48, descender -20.
// Ops: V x y0 y1 (vertical stem), H y x0 x1 (horizontal bar),
// D x1 y1 x2 y2 (diagonal), A cx cy rx ry a0 a1 (arc stroke),
// O cx cy rx ry (ring), o cx cy rx ry w (thin ring), F x y w h (filled rect),
// C cx cy r (filled disc).
type Op = (string | number)[];
type GlyphDef = [number, Op[]];
const GL: Record<string, GlyphDef> = {
  'A': [56, [['D', 6, 0, 27, 70], ['D', 48, 0, 27, 70], ['H', 24, 15, 39]]],
  'B': [50, [['V', 0, 0, 70], ['H', 70, 0, 30], ['A', 30, 53, 17, 17, -90, 90], ['H', 35, 0, 32], ['A', 32, 17, 19, 17, -90, 90], ['H', 0, 0, 32]]],
  'C': [50, [['A', 27, 35, 23, 35, 40, 320]]],
  'D': [54, [['V', 0, 0, 70], ['H', 70, 0, 26], ['A', 26, 35, 24, 35, -90, 90], ['H', 0, 0, 26]]],
  'E': [44, [['V', 0, 0, 70], ['H', 70, 0, 38], ['H', 35, 0, 32], ['H', 0, 0, 38]]],
  'F': [42, [['V', 0, 0, 70], ['H', 70, 0, 36], ['H', 35, 0, 30]]],
  'G': [54, [['A', 27, 35, 23, 35, 35, 325], ['H', 35, 30, 48], ['V', 44, 14, 35]]],
  'H': [54, [['V', 0, 0, 70], ['V', 46, 0, 70], ['H', 35, 0, 52]]],
  'I': [28, [['V', 9, 0, 70]]],
  'J': [40, [['V', 28, 12, 70], ['A', 15, 12, 13, 12, 180, 360], ['H', 70, 16, 42]]],
  'K': [50, [['V', 0, 0, 70], ['D', 5, 35, 44, 70], ['D', 13, 28, 46, 0]]],
  'L': [44, [['V', 0, 0, 70], ['H', 0, 0, 38]]],
  'M': [64, [['V', 0, 0, 70], ['D', 0, 70, 31, 8], ['D', 62, 70, 31, 8], ['V', 56, 0, 70]]],
  'N': [56, [['V', 0, 0, 70], ['D', 0, 70, 48, 0], ['V', 48, 0, 70]]],
  'O': [54, [['O', 26, 35, 23, 35]]],
  'P': [46, [['V', 0, 0, 70], ['H', 70, 0, 28], ['A', 28, 53, 17, 17, -90, 90], ['H', 36, 0, 28]]],
  'Q': [54, [['O', 26, 35, 23, 35], ['D', 36, 8, 50, -8]]],
  'R': [50, [['V', 0, 0, 70], ['H', 70, 0, 28], ['A', 28, 53, 17, 17, -90, 90], ['H', 36, 0, 28], ['D', 14, 32, 46, 0]]],
  'S': [46, [['A', 23, 52, 21, 17, 20, 250], ['A', 23, 18, 21, 17, 200, 470]]],
  'T': [46, [['H', 70, 0, 46], ['V', 20, 0, 70]]],
  'U': [54, [['V', 0, 16, 70], ['A', 26, 16, 26, 16, 180, 360], ['V', 46, 16, 70]]],
  'V': [52, [['D', 0, 70, 25, 0], ['D', 50, 70, 25, 0]]],
  'W': [74, [['D', 0, 70, 17, 0], ['D', 35, 70, 17, 0], ['D', 35, 70, 53, 0], ['D', 70, 70, 53, 0]]],
  'X': [50, [['D', 2, 70, 48, 0], ['D', 48, 70, 2, 0]]],
  'Y': [48, [['D', 2, 70, 24, 32], ['D', 46, 70, 24, 32], ['V', 21, 0, 32]]],
  'Z': [46, [['H', 70, 0, 46], ['D', 46, 70, 0, 0], ['H', 0, 0, 46]]],
  'a': [44, [['V', 6, 28, 44], ['A', 22, 40, 15, 10, 15, 165], ['V', 36, -2, 48], ['O', 20, 15, 16, 15]]],
  'b': [44, [['V', 0, 0, 70], ['O', 24, 24, 16, 20]]],
  'c': [42, [['A', 22, 24, 19, 22, 40, 320]]],
  'd': [44, [['O', 20, 24, 16, 20], ['V', 38, 0, 70]]],
  'e': [42, [['A', 21, 24, 18, 20, 25, 310], ['H', 24, 4, 38]]],
  'f': [36, [['V', 10, 0, 56], ['A', 18, 56, 10, 10, 0, 180], ['H', 32, 4, 32]]],
  'g': [44, [['O', 20, 26, 16, 18], ['V', 36, -10, 46], ['A', 24, -10, 12, 8, 180, 360]]],
  'h': [44, [['V', 0, 0, 70], ['A', 22, 26, 16, 18, 0, 180], ['V', 38, 0, 26]]],
  'i': [24, [['V', 7, 0, 48], ['C', 11, 62, 4]]],
  'j': [26, [['C', 13, 62, 4], ['V', 9, 8, 48], ['A', 9, 2, 9, 10, 180, 360]]],
  'k': [44, [['V', 0, 0, 70], ['D', 5, 30, 40, 48], ['D', 15, 22, 40, 0]]],
  'l': [24, [['V', 7, 0, 70]]],
  'm': [64, [['V', 0, 0, 48], ['A', 16, 26, 13, 16, 0, 180], ['V', 29, 0, 26], ['A', 45, 26, 13, 16, 0, 180], ['V', 58, 0, 26]]],
  'n': [44, [['V', 0, 0, 48], ['A', 22, 26, 16, 18, 0, 180], ['V', 38, 0, 26]]],
  'o': [42, [['O', 21, 24, 18, 22]]],
  'p': [44, [['V', 0, -20, 48], ['O', 24, 24, 16, 20]]],
  'q': [44, [['O', 20, 24, 16, 20], ['V', 38, -20, 48]]],
  'r': [32, [['V', 0, 0, 48], ['A', 15, 36, 12, 10, 0, 90], ['V', 25, 24, 38]]],
  's': [40, [['A', 20, 36, 18, 13, 20, 250], ['A', 20, 13, 18, 13, 200, 470]]],
  't': [32, [['V', 10, 6, 56], ['A', 15, 6, 7, 7, 180, 330], ['H', 32, 0, 30]]],
  'u': [44, [['V', 0, 14, 48], ['A', 22, 14, 19, 14, 180, 360], ['V', 38, 0, 48]]],
  'v': [44, [['D', 0, 48, 22, 0], ['D', 44, 48, 22, 0]]],
  'w': [62, [['D', 0, 48, 15, 0], ['D', 31, 48, 15, 0], ['D', 31, 48, 47, 0], ['D', 62, 48, 47, 0]]],
  'x': [42, [['D', 2, 48, 40, 0], ['D', 40, 48, 2, 0]]],
  'y': [44, [['D', 0, 48, 22, 6], ['D', 44, 48, 22, 6], ['D', 22, 6, 16, -20]]],
  'z': [40, [['H', 48, 0, 40], ['D', 40, 48, 0, 0], ['H', 0, 0, 40]]],
  '0': [44, [['O', 22, 35, 19, 35]]],
  '1': [28, [['D', 7, 56, 19, 70], ['V', 16, 0, 70], ['H', 0, 3, 25]]],
  '2': [44, [['A', 22, 52, 19, 16, 10, 180], ['D', 40, 50, 3, 2], ['H', 0, 0, 42]]],
  '3': [44, [['A', 22, 52, 17, 16, -70, 70], ['A', 24, 18, 19, 16, -70, 70]]],
  '4': [46, [['D', 32, 70, 3, 10], ['H', 12, 0, 40], ['V', 30, 0, 70]]],
  '5': [44, [['H', 70, 3, 40], ['V', 3, 36, 70], ['A', 24, 18, 19, 16, 180, 360], ['H', 18, 6, 42]]],
  '6': [44, [['O', 22, 18, 17, 16], ['A', 22, 36, 17, 16, 90, 270]]],
  '7': [44, [['H', 70, 0, 42], ['D', 42, 70, 13, 0]]],
  '8': [46, [['O', 23, 52, 16, 15], ['O', 23, 18, 18, 16]]],
  '9': [44, [['O', 22, 52, 17, 16], ['A', 22, 34, 17, 16, 270, 450]]],
  '.': [12, [['C', 6, 0, 4]]],
  ',': [12, [['C', 6, 2, 4], ['D', 8, 0, 1, -12]]],
  ':': [12, [['C', 6, 18, 4], ['C', 6, 44, 4]]],
  ';': [12, [['C', 6, 44, 4], ['C', 6, 16, 4], ['D', 8, 14, 1, 2]]],
  "'": [12, [['D', 8, 70, 3, 54]]],
  '"': [22, [['D', 7, 70, 2, 54], ['D', 18, 70, 13, 54]]],
  '$': [46, [['A', 23, 53, 20, 16, 20, 250], ['A', 23, 17, 20, 16, 200, 470], ['V', 19, -8, 78]]],
  '°': [18, [['o', 9, 58, 7, 7, 3.5]]],
  '·': [12, [['C', 6, 34, 4.5]]],
  '-': [36, [['H', 34, 4, 32]]],
  '–': [44, [['H', 35, 2, 42]]],
  '—': [56, [['H', 35, 0, 56]]],
  '&': [52, [['O', 20, 18, 13, 13], ['A', 22, 42, 14, 11, 0, 270], ['D', 34, 54, 8, -6]]],
  '(': [20, [['A', 32, 35, 13, 35, 60, 300]]],
  ')': [20, [['A', 8, 35, 13, 35, 240, 480]]],
  '/': [30, [['D', 8, 0, 24, 70]]],
  '%': [56, [['O', 14, 52, 10, 10], ['O', 42, 18, 10, 10], ['D', 46, 70, 10, 0]]],
  '+': [44, [['H', 35, 8, 36], ['V', 18, 13, 57]]],
  '!': [16, [['V', 6, 24, 70], ['C', 8, 4, 4.5]]],
  '?': [44, [['A', 22, 52, 17, 15, 0, 270], ['D', 22, 36, 20, 26], ['C', 22, 6, 4.5]]],
  '[': [20, [['V', 4, 0, 70], ['H', 70, 4, 16], ['H', 0, 4, 16]]],
  ']': [20, [['V', 12, 0, 70], ['H', 70, 4, 16], ['H', 0, 4, 16]]],
  '*': [40, [['D', 20, 70, 20, 20], ['D', 4, 60, 36, 30], ['D', 36, 60, 4, 30]]],
};
const SPACE_W = 18;

type Face = { stem: number; ext: number; st: number; serif: boolean; shear: number };
const MASTHEAD: Face = { stem: 8.5, ext: 1.8, st: 2.0, serif: true, shear: 0 };
const HEADLINE: Face = { stem: 10, ext: 1.8, st: 2.0, serif: true, shear: 0 };
const BODY: Face = { stem: 7, ext: 1.8, st: 2.0, serif: true, shear: 0 };
const ITALIC: Face = { stem: 7, ext: 1.8, st: 2.0, serif: true, shear: 0.16 };
const SANS: Face = { stem: 9, ext: 0, st: 0, serif: false, shear: 0 };
const SANS_SM: Face = { stem: 8, ext: 0, st: 0, serif: false, shear: 0 };

function normChar(ch: string): string {
  if (ch === '’' || ch === '‘') return "'";
  if (ch === '“' || ch === '”') return '"';
  return ch;
}

function drawGlyph(cv: Canvas, ch0: string, penX: number, baseY: number, size: number, face: Face, color: RGB): void {
  const ch = normChar(ch0);
  const g = GL[ch];
  if (!g) return;
  const sc = size / 70;
  const px = (x: number, y: number): [number, number] => [penX + (x + face.shear * y) * sc, baseY - y * sc];
  const sw = face.stem * sc;
  for (const op of g[1]) {
    const k = op[0] as string;
    if (k === 'V') {
      const x = op[1] as number, y0 = op[2] as number, y1 = op[3] as number;
      const [ax, ay] = px(x, y0);
      const [bx, by] = px(x + face.stem, y1);
      cv.rect(ax, by, bx, ay, color);
      if (face.serif) {
        const ext = face.ext * sc, st = face.st * sc;
        if (y1 >= 48) cv.rect(px(x - face.ext, y1)[0], by, px(x + face.stem + face.ext, y1)[0], by + st, color);
        if (y0 === 0) cv.rect(px(x - face.ext, y0)[0], ay - st, px(x + face.stem + face.ext, y0)[0], ay, color);
      }
    } else if (k === 'H') {
      const y = op[1] as number, x0 = op[2] as number, x1 = op[3] as number;
      const [ax, ay] = px(x0, y);
      const [bx, by] = px(x1, y - face.stem);
      cv.rect(ax, by, bx, ay, color);
      if (face.serif) {
        const ext = face.ext * sc, st = face.st * sc;
        cv.rect(ax - st, by - ext, ax, ay + ext, color);
        cv.rect(bx, by - ext, bx + st, ay + ext, color);
      }
    } else if (k === 'D') {
      const x1 = op[1] as number, y1 = op[2] as number, x2 = op[3] as number, y2 = op[4] as number;
      const p1 = px(x1, y1), p2 = px(x2, y2);
      cv.strokePts([p1, p2], sw, color);
    } else if (k === 'A') {
      const cx = op[1] as number, cy = op[2] as number, rx = op[3] as number, ry = op[4] as number;
      const a0 = op[5] as number, a1 = op[6] as number;
      const pts: number[][] = [];
      const step = 4;
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      for (let a = lo; a <= hi + 0.001; a += step) {
        const rad = (Math.min(a, hi) * Math.PI) / 180;
        pts.push(px(cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)));
      }
      cv.strokePts(pts, sw, color);
    } else if (k === 'O' || k === 'o') {
      const cx = op[1] as number, cy = op[2] as number, rx = op[3] as number, ry = op[4] as number;
      const w = k === 'o' ? (op[5] as number) : face.stem;
      const [ccx, ccy] = px(cx, cy);
      cv.ring(ccx, ccy, rx * sc, ry * sc, w * sc, color);
    } else if (k === 'F') {
      const x = op[1] as number, y = op[2] as number, w = op[3] as number, h = op[4] as number;
      const [ax, ay] = px(x, y);
      const [bx, by] = px(x + w, y + h);
      cv.rect(ax, by, bx, ay, color);
    } else if (k === 'C') {
      const cx = op[1] as number, cy = op[2] as number, r = op[3] as number;
      const [ccx, ccy] = px(cx, cy);
      cv.ellipse(ccx, ccy, r * sc, r * sc, color);
    }
  }
}

function adv(ch0: string, face: Face, size: number): number {
  const ch = normChar(ch0);
  if (ch === ' ') return SPACE_W * size / 70;
  const g = GL[ch];
  if (!g) return 20 * size / 70;
  return g[0] * size / 70;
}
function textWidth(s: string, face: Face, size: number, spacing = 0): number {
  let w = 0;
  for (const ch of s) w += adv(ch, face, size) + spacing;
  return w - spacing;
}
function drawText(cv: Canvas, s: string, x: number, y: number, face: Face, size: number, color: RGB, align: 'left' | 'center' | 'right' = 'left', spacing = 0): void {
  let pen = x;
  if (align === 'center') pen = x - textWidth(s, face, size, spacing) / 2;
  if (align === 'right') pen = x - textWidth(s, face, size, spacing);
  for (const ch of s) {
    if (ch !== ' ') drawGlyph(cv, ch, pen, y, size, face, color);
    pen += adv(ch, face, size) + spacing;
  }
}
// One shared size for all lines, from the longest line (no line balloons).
function fitLines(lines: string[], face: Face, maxW: number, maxSize: number, spacing = 0): number {
  let s = maxSize;
  for (const ln of lines) {
    const w = textWidth(ln, face, maxSize, spacing);
    if (w > maxW) s = Math.min(s, (maxSize * maxW) / w);
  }
  return s;
}
function wrap(s: string, face: Face, size: number, maxW: number, spacing = 0): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (textWidth(t, face, size, spacing) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------ illustrations
function drawSkyline(cv: Canvas, rng: () => number): void {
  const x0 = 30, x1 = 994, yBot = 618, yTop = 484;
  // Halftone red dots in the sky, bigger lower down.
  for (let y = yTop + 12; y < yBot - 40; y += 13) {
    for (let xi = x0 + 8 + ((y / 13) % 2) * 6; xi < x1 - 8; xi += 13) {
      const r = 1 + ((y - yTop) / 130) * 2.6;
      cv.ellipse(xi, y, r, r, RED);
    }
  }
  // Red striped sun, right side.
  const scx = 878, scy = 532, sr = 40;
  cv.ellipse(scx, scy, sr, sr, RED);
  for (const dy of [-26, -12, 2, 16]) {
    const hw = Math.sqrt(Math.max(0, sr * sr - dy * dy));
    cv.rect(scx - hw, scy + dy - 2.5, scx + hw, scy + dy + 2.5, PAPER);
  }
  // Black skyline with lit windows.
  let x = x0 + 4;
  while (x < x1 - 30) {
    const bw = 30 + rng() * 42;
    const bh = 34 + rng() * 78;
    const top = yBot - bh;
    cv.rect(x, top, x + bw, yBot, INK);
    for (let wy = top + 8; wy < yBot - 8; wy += 11) {
      for (let wx = x + 6; wx < x + bw - 6; wx += 9) {
        if (rng() < 0.42) cv.rect(wx, wy, wx + 2.5, wy + 3.5, PAPER);
      }
    }
    x += bw + 2 + rng() * 8;
  }
  // Palm trees at both edges.
  const palm = (bx: number, dir: number): void => {
    const topX = bx - dir * 12, topY = 500;
    cv.line(bx, yBot, topX, topY, 6, INK);
    for (let i = 0; i < 5; i++) {
      const a = (-30 - i * 32) * dir;
      const rad = (a * Math.PI) / 180;
      const ex = topX + Math.sin(rad) * 42 * dir;
      const ey = topY - Math.cos(rad) * 18 - 6;
      cv.line(topX, topY, ex, ey, 3.5, INK);
    }
  };
  palm(64, 1);
  palm(962, -1);
  // White car on the street.
  const car = (cx: number, cy: number): void => {
    cv.rect(cx - 46, cy - 12, cx + 46, cy + 2, PAPER);
    cv.rect(cx - 30, cy - 24, cx + 26, cy - 12, PAPER);
    cv.rect(cx - 22, cy - 21, cx - 4, cy - 13, INK);
    cv.rect(cx + 2, cy - 21, cx + 20, cy - 13, INK);
    cv.ellipse(cx - 28, cy + 2, 8, 8, INK);
    cv.ellipse(cx + 28, cy + 2, 8, 8, INK);
    cv.ellipse(cx - 28, cy + 2, 3.5, 3.5, PAPER);
    cv.ellipse(cx + 28, cy + 2, 3.5, 3.5, PAPER);
  };
  car(724, 606);
}

function drawBarChart(cv: Canvas, x: number, y: number): void {
  // Three black bars, ascending, with a red rising arrow.
  const base = y + 58;
  const hs = [22, 40, 58];
  for (let i = 0; i < 3; i++) {
    cv.rect(x + 8 + i * 42, base - hs[i], x + 8 + i * 42 + 30, base, INK);
  }
  cv.line(x, base - 14, x + 132, base - 62, 5, RED);
  cv.line(x + 132, base - 62, x + 112, base - 60, 5, RED);
  cv.line(x + 132, base - 62, x + 126, base - 42, 5, RED);
}

function drawGlobe(cv: Canvas, cx: number, cy: number): void {
  cv.ring(cx, cy, 26, 26, 3.5, INK);
  cv.ring(cx, cy, 10, 26, 2.5, INK);
  cv.line(cx - 26, cy, cx + 26, cy, 2.5, INK);
  cv.ellipse(cx - 26, cy - 2, 12, 6, INK);
  cv.ellipse(cx - 26, cy - 2, 3, 3, RED);
  cv.ellipse(cx + 14, cy + 12, 3, 3, RED);
  cv.ellipse(cx + 4, cy - 16, 3, 3, RED);
}

function drawDome(cv: Canvas, cx: number, baseY: number): void {
  // Capitol dome: black half dome, columns, base, tiny red flag.
  const pts: number[][] = [];
  for (let a = 0; a <= 180; a += 6) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + 42 * Math.cos(rad), baseY - 30 * Math.sin(rad)]);
  }
  pts.push([cx + 42, baseY], [cx - 42, baseY]);
  cv.fillPoly([pts], INK);
  cv.rect(cx - 2, baseY - 46, cx + 2, baseY - 28, INK);
  cv.line(cx + 2, baseY - 46, cx + 14, baseY - 42, 3, RED);
  cv.rect(cx - 46, baseY, cx + 46, baseY + 4, INK);
  for (let i = -3; i <= 3; i++) {
    cv.rect(cx + i * 12 - 1.5, baseY - 22, cx + i * 12 + 1.5, baseY, PAPER);
  }
}

function drawRocket(cv: Canvas, x: number, y: number): void {
  // Small black rocket, tilted up-right, with a red dotted trail.
  const cx = x + 46, cy = y + 34;
  const body: number[][] = [[cx - 10, cy + 22], [cx - 12, cy - 6], [cx, cy - 26], [cx + 12, cy - 6], [cx + 10, cy + 22]];
  cv.fillPoly([body], INK);
  cv.ellipse(cx, cy - 8, 5.5, 5.5, PAPER);
  cv.ellipse(cx - 12, cy + 24, 3, 3, RED);
  cv.ellipse(cx - 20, cy + 30, 2.5, 2.5, RED);
  cv.ellipse(cx - 28, cy + 36, 2, 2, RED);
}

function drawCyclone(cv: Canvas, cx: number, cy: number): void {
  for (const r of [26, 19, 12]) {
    cv.arcStroke(cx, cy, r, r, 20, 300, 3.5, INK);
  }
  cv.ellipse(cx, cy, 4.5, 4.5, RED);
}

// -------------------------------------------------------------------- page
function drawPage(): Canvas {
  const cv = new Canvas();
  const rng = mulberry32(20261119);
  const rule = (y: number, t: number, x0 = 30, x1 = 994, c: RGB = INK): void => {
    cv.rect(x0, y, x1, y + t, c);
  };
  // Frame: double border.
  cv.rect(10, 10, 1014, 13, INK);
  cv.rect(10, 1011, 1014, 1014, INK);
  cv.rect(10, 10, 13, 1014, INK);
  cv.rect(1011, 10, 1014, 1014, INK);
  cv.rect(18, 18, 1006, 19.5, INK);
  cv.rect(18, 1004.5, 1006, 1006, INK);
  cv.rect(18, 18, 19.5, 1006, INK);
  cv.rect(1004.5, 18, 1006, 1006, INK);

  // Masthead, fitted to the page width like the reference.
  const mastSize = fitLines(['THE WORLD BULLETIN'], MASTHEAD, 964, 100, 3);
  drawText(cv, 'THE WORLD BULLETIN', 512, 108, MASTHEAD, mastSize, INK, 'center', 3);
  rule(122, 2);
  // Meta row: issue number left, date centred, no price anywhere.
  drawText(cv, 'No. 001', 30, 146, SANS, 21, INK, 'left', 1);
  drawText(cv, 'THURSDAY, 19 NOVEMBER 2026', 512, 146, SANS, 21, INK, 'center', 1);
  rule(156, 5);
  rule(166, 1.5);
  // Weather strip.
  drawText(cv, 'WEATHER: VICE CITY 28° CLEAR · NEW YORK 12° · LONDON 9°', 30, 186, SANS_SM, 16, TEAL, 'left', 1);
  drawText(cv, 'OPINION: THE DAY GAMES GREW UP', 994, 186, SANS_SM, 16, INK, 'right', 1);
  // Red kicker.
  drawText(cv, 'VICE CITY AWAITS · OUT TODAY', 30, 212, SANS, 21, RED, 'left', 1);
  // Lead headline, two lines sharing one size.
  const headSize = fitLines(['GTA VI LAUNCHES', 'WORLDWIDE'], HEADLINE, 964, 110, 5);
  drawText(cv, 'GTA VI LAUNCHES', 30, 326, HEADLINE, headSize, INK, 'left', 5);
  drawText(cv, 'WORLDWIDE', 30, 434, HEADLINE, headSize, INK, 'left', 5);
  // Deck, italic serif, fitted to the page width.
  const deckSize = fitLines(['Gamers enter Vice City as the biggest game launch in history rolls out across the world today.'], ITALIC, 964, 27, 0.5);
  drawText(cv, 'Gamers enter Vice City as the biggest game launch in history rolls out across the world today.', 30, 474, ITALIC, deckSize, INK, 'left', 0.5);
  // Illustration panel.
  cv.rect(30, 484, 994, 486, INK);
  cv.rect(30, 616, 994, 618, INK);
  cv.rect(30, 484, 32, 618, INK);
  cv.rect(992, 484, 994, 618, INK);
  drawSkyline(cv, rng);
  // Caption, italic serif.
  drawText(cv, 'Sunset over Vice City: players take to the streets as the game opens worldwide today.', 30, 642, ITALIC, 20, INK, 'left', 0.5);
  rule(656, 2);

  // Three columns.
  const cols = [
    { x0: 30, x1: 340, label: 'TECHNOLOGY', head: ['Anthropic IPO:', '$81.3bn'], body: 'Biggest stock market debut ever.' },
    { x0: 352, x1: 662, label: 'DIPLOMACY', head: ['Trump, Xi Jinping', '& Putin Meet'], body: 'Trilateral talks in Shenzhen, China.' },
    { x0: 674, x1: 994, label: 'POLITICS', head: ['Jeffries Makes', 'History'], body: 'First Black nominee for US House Speaker.' },
  ];
  for (const col of cols) {
    drawText(cv, col.label, col.x0, 680, SANS, 21, RED, 'left', 1);
  }
  drawBarChart(cv, 52, 700);
  drawGlobe(cv, 507, 730);
  drawDome(cv, 834, 756);
  for (const col of cols) {
    const hs = fitLines(col.head, HEADLINE, col.x1 - col.x0 - 10, 40, 2);
    drawText(cv, col.head[0], col.x0 + 2, 792, HEADLINE, hs, INK, 'left', 2);
    drawText(cv, col.head[1], col.x0 + 2, 830, HEADLINE, hs, INK, 'left', 2);
    const bl = wrap(col.body, BODY, 21, col.x1 - col.x0, 0.8);
    bl.forEach((ln, i) => drawText(cv, ln, col.x0, 858 + i * 26, BODY, 21, INK, 'left', 0.8));
  }
  cv.rect(346, 672, 347.5, 890, INK);
  cv.rect(668, 672, 669.5, 890, INK);
  rule(898, 2);

  // Bottom row: Voyager and Cyclone.
  drawText(cv, 'SPACE', 150, 920, SANS, 20, RED, 'left', 1);
  drawRocket(cv, 34, 912);
  const voySize = fitLines(['Voyager 1: One Light-Day'], HEADLINE, 340, 32, 2);
  drawText(cv, 'Voyager 1: One Light-Day', 150, 950, HEADLINE, voySize, INK, 'left', 2);
  drawText(cv, 'Farthest human object, 50 years on.', 150, 976, BODY, 20, INK, 'left', 0.8);
  cv.rect(512, 906, 513.5, 980, INK);
  drawText(cv, 'WEATHER', 644, 920, SANS, 20, RED, 'left', 1);
  drawCyclone(cv, 584, 946);
  const cycSize = fitLines(['Cyclone Akvan Nears India'], HEADLINE, 340, 32, 2);
  drawText(cv, 'Cyclone Akvan Nears India', 644, 950, HEADLINE, cycSize, INK, 'left', 2);
  drawText(cv, '50,000 evacuated in Odisha.', 644, 976, BODY, 20, INK, 'left', 0.8);

  // Footer.
  rule(984, 1.5);
  drawText(cv, 'All six stories first reported on 19 November 2026 · The World Bulletin · Page 1', 512, 1000, BODY, 16, INK, 'center', 0.5);

  // Paper grain: deterministic speckles, visible at thumbnail size.
  for (let i = 0; i < 9000; i++) {
    const x = rng() * W, y = rng() * H;
    cv.set(x, y, rng() < 0.04 ? SPECK : GRAIN);
  }
  return cv;
}

// --------------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  mkdirSync(outDir, { recursive: true });
  const cv = drawPage();
  const png = encodePNG(W, H, cv.buf);
  writeFileSync(outDir + '/entry.png', png);
  console.log('entry.png ' + png.length + ' bytes sha256 ' + 'see sha256sum' + ' -> ' + outDir + '/entry.png');
}
main();

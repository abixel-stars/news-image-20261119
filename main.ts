// The World Bulletin - front page for 19 November 2026.
// Node 22 entrypoint: renders the bulletin with Python PIL and writes
// entry.png into MAKEFUN_OUTPUT_DIR (default /output). No network,
// fully deterministic: same bytes on every run.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const PY = `
import os
import random
import sys
from PIL import Image, ImageDraw, ImageFont

W = 1024
H = 1024
PAPER = (244, 238, 220)
INK = (26, 24, 20)
VERM = (196, 44, 26)
TEAL = (13, 109, 104)
CREAM = (255, 250, 238)
SPECK_DARK = (96, 86, 64)
SPECK_LT = (255, 251, 240)

SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

_cache = {}

def load_font(paths, size):
    if isinstance(paths, str):
        paths = [paths]
    key = (tuple(paths), size)
    if key not in _cache:
        got = None
        for p in paths:
            try:
                got = ImageFont.truetype(p, size)
                break
            except Exception:
                continue
        if got is None:
            got = ImageFont.load_default()
        _cache[key] = got
    return _cache[key]

def fit_font(draw, paths, start, text, max_w):
    size = start
    while size > 10:
        f = load_font(paths, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return load_font(paths, 10)

def wrap(draw, text, fnt, max_w):
    lines = []
    cur = ""
    for word in text.split(" "):
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines

def draw_lines(draw, x, y, lines, fnt, fill, lh):
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += lh
    return y

def centered(draw, cx, y, text, fnt, fill):
    w = draw.textlength(text, font=fnt)
    draw.text((cx - w / 2, y), text, font=fnt, fill=fill)

def hline(draw, x0, x1, y, fill, width=1):
    draw.line([(x0, y), (x1, y)], fill=fill, width=width)

def vline(draw, x, y0, y1, fill, width=1):
    draw.line([(x, y0), (x, y1)], fill=fill, width=width)

def draw_bird(draw, x, y):
    draw.line([(x, y), (x + 6, y - 5), (x + 12, y)], fill=INK, width=2)

def draw_palm(draw, cx, base_y, top_y, lean):
    span = base_y - top_y
    pts = [
        (cx, base_y),
        (cx + lean * 0.3, base_y - span * 0.4),
        (cx + lean * 0.7, base_y - span * 0.75),
        (cx + lean, top_y),
    ]
    draw.line(pts, fill=INK, width=6, joint="curve")
    crown = (cx + lean, top_y)
    for tip in [(-34, 14), (-28, -8), (-4, -24), (20, -12), (34, 10)]:
        mid = (crown[0] + tip[0] * 0.55, crown[1] + tip[1] * 0.55 - 10)
        end = (crown[0] + tip[0], crown[1] + tip[1])
        draw.line([crown, mid, end], fill=INK, width=4, joint="curve")

def draw_skyline(draw, rng, tops, bottom):
    for (bx, bw, top) in tops:
        draw.rectangle([bx, top, bx + bw, bottom], fill=INK)
        for wx in range(bx + 7, bx + bw - 4, 11):
            for wy in range(top + 9, bottom - 6, 13):
                if rng.random() < 0.38:
                    draw.rectangle([wx, wy, wx + 3, wy + 4], fill=PAPER)

def draw_car(draw, x, y):
    draw.rounded_rectangle([x, y, x + 68, y + 16], radius=6, fill=CREAM, outline=INK, width=2)
    draw.polygon([(x + 14, y), (x + 22, y - 10), (x + 46, y - 10), (x + 54, y)],
                 fill=CREAM, outline=INK)
    draw.ellipse([x + 10, y + 12, x + 20, y + 22], fill=INK)
    draw.ellipse([x + 48, y + 12, x + 58, y + 22], fill=INK)

def draw_bars(draw, x, y_base):
    heights = [22, 38, 54]
    xs = [x + 8, x + 62, x + 116]
    for bx, h in zip(xs, heights):
        draw.rectangle([bx, y_base - h, bx + 34, y_base], fill=INK)
    draw.line([(x, y_base), (x + 168, y_base)], fill=INK, width=2)
    draw.line([(x + 2, y_base - 12), (x + 168, y_base - 58)], fill=VERM, width=4)
    draw.polygon([(x + 168, y_base - 58), (x + 150, y_base - 56), (x + 162, y_base - 42)],
                 fill=VERM)

def draw_globe(draw, cx, cy, r):
    draw.ellipse([cx - r - 14, cy - 12, cx + r + 14, cy + 12], outline=TEAL, width=2)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PAPER, outline=INK, width=3)
    draw.ellipse([cx - 13, cy - r, cx + 13, cy + r], outline=INK, width=2)
    draw.line([(cx - r, cy), (cx + r, cy)], fill=INK, width=2)
    draw.ellipse([cx - r, cy - 12, cx + r, cy + 12], outline=INK, width=2)
    for (dx, dy) in [(-12, -10), (8, -14), (12, 10)]:
        draw.ellipse([cx + dx - 3, cy + dy - 3, cx + dx + 3, cy + dy + 3], fill=VERM)

def draw_capitol(draw, x, y_base):
    draw.pieslice([x + 38, y_base - 52, x + 130, y_base - 4], 180, 360, fill=INK)
    draw.rectangle([x + 78, y_base - 62, x + 90, y_base - 50], fill=INK)
    draw.line([(x + 84, y_base - 68), (x + 84, y_base - 62)], fill=INK, width=2)
    draw.polygon([(x + 84, y_base - 68), (x + 84, y_base - 60), (x + 98, y_base - 64)],
                 fill=VERM)
    for i in range(5):
        cx = x + 44 + i * 20
        draw.rectangle([cx, y_base - 22, cx + 8, y_base], fill=INK)
    draw.line([(x + 30, y_base), (x + 138, y_base)], fill=INK, width=2)
    draw.line([(x + 26, y_base + 4), (x + 142, y_base + 4)], fill=INK, width=1)

def draw_voyager(draw, rng, x0, y0, x1, y1):
    draw.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=INK)
    for _ in range(14):
        sx = rng.randint(x0 + 6, x1 - 6)
        sy = rng.randint(y0 + 6, y1 - 6)
        draw.point((sx, sy), fill=PAPER)
    for t in range(0, 11):
        px = x0 + 8 + t * 9
        py = y1 - 8 - int((t * t) * 0.5)
        draw.ellipse([px - 2, py - 2, px + 2, py + 2], fill=PAPER)
    draw.rectangle([x0 + 52, y0 + 26, x0 + 70, y0 + 40], fill=PAPER)
    draw.line([(x0 + 52, y0 + 33), (x0 + 70, y0 + 33)], fill=INK, width=1)
    draw.polygon([(x0 + 70, y0 + 26), (x0 + 70, y0 + 40), (x0 + 88, y0 + 33)],
                 outline=PAPER, width=2)
    draw.ellipse([x0 + 96, y0 + 18, x0 + 102, y0 + 24], fill=VERM)

def draw_cyclone(draw, cx, cy):
    for i, r in enumerate([8, 14, 20, 26]):
        start = 20 + i * 55
        draw.arc([cx - r, cy - r, cx + r, cy + r], start, start + 250, fill=INK, width=3)
    draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=VERM)
    for i in range(4):
        x = cx - 42 + i * 28
        draw.line([(x, cy + 32), (x - 5, cy + 40)], fill=INK, width=2)

def build(out_path):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    rng = random.Random(20261119)

    # Double outer border, like a printed front page.
    d.rectangle([14, 14, 1010, 1010], outline=INK, width=3)
    d.rectangle([22, 22, 1002, 1002], outline=INK, width=1)

    # Masthead.
    mast = fit_font(d, SERIF_B, 84, "THE WORLD BULLETIN", 952)
    centered(d, 512, 44, "THE WORLD BULLETIN", mast, INK)
    hline(d, 36, 988, 136, INK, 2)

    # Dateline row.
    d.text((36, 146), "No. 324", font=load_font(SANS, 19), fill=INK)
    centered(d, 512, 144, "THURSDAY, 19 NOVEMBER 2026", load_font(SANS_B, 21), INK)
    price = "PRICE $1.50"
    pw = d.textlength(price, font=load_font(SANS, 19))
    d.text((988 - pw, 146), price, font=load_font(SANS, 19), fill=INK)
    hline(d, 36, 988, 182, INK, 4)
    hline(d, 36, 988, 188, INK, 1)

    # Weather strip and opinion teaser.
    d.text((36, 196), "WEATHER: VICE CITY 28° CLEAR · NEW YORK 12° · LONDON 9°",
           font=load_font(SANS_B, 15), fill=TEAL)
    op = "OPINION: THE DAY GAMES GREW UP"
    ow = d.textlength(op, font=load_font(SANS_B, 15))
    d.text((988 - ow, 196), op, font=load_font(SANS_B, 15), fill=INK)

    # Lead story.
    d.text((36, 222), "VICE CITY AWAITS · OUT TODAY",
           font=load_font(SANS_B, 19), fill=VERM)
    head = fit_font(d, SERIF_B, 92, "GTA VI LAUNCHES", 952)
    d.text((36, 246), "GTA VI LAUNCHES", font=head, fill=INK)
    d.text((36, 338), "WORLDWIDE", font=head, fill=INK)
    deck = wrap(d, "Gamers enter Vice City as the biggest game launch in history rolls out across the world today.",
                load_font([SERIF_I, SERIF], 22), 952)
    draw_lines(d, 36, 436, deck, load_font([SERIF_I, SERIF], 22), INK, 28)

    # Lead illustration: sunset over Vice City.
    d.rectangle([36, 500, 988, 630], outline=INK, width=2)
    for yy in range(506, 566, 13):
        t = (yy - 506) / 60.0
        r = 1.0 + 2.4 * t
        for xx in range(44, 980, 13):
            d.ellipse([xx - r, yy - r, xx + r, yy + r], fill=VERM)
    sun_cx, sun_cy, sun_r = 838, 548, 40
    d.ellipse([sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r], fill=VERM)
    for dy in (-13, 0, 13):
        d.rectangle([sun_cx - sun_r - 2, sun_cy + dy - 2, sun_cx + sun_r + 2, sun_cy + dy + 2],
                    fill=PAPER)
    tops = [(40, 58, 566), (98, 46, 546), (144, 66, 572), (210, 44, 552),
            (254, 56, 574), (310, 50, 548), (360, 62, 568), (422, 46, 542),
            (468, 58, 570), (526, 50, 554), (576, 62, 572), (638, 48, 546),
            (686, 56, 566), (742, 50, 550), (792, 60, 570), (852, 46, 544),
            (898, 56, 564), (954, 30, 556)]
    draw_skyline(d, rng, tops, 626)
    draw_palm(d, 92, 626, 540, -10)
    draw_palm(d, 938, 626, 544, 10)
    draw_car(d, 600, 600)
    draw_bird(d, 300, 520)
    draw_bird(d, 360, 512)
    draw_bird(d, 700, 516)
    d.text((36, 636), "Sunset over Vice City: players take to the streets as the game opens worldwide today.",
           font=load_font([SERIF_I, SERIF], 17), fill=INK)

    hline(d, 36, 988, 666, INK, 2)

    # Three-column row: technology, diplomacy, politics.
    vline(d, 354, 676, 888, INK, 1)
    vline(d, 670, 676, 888, INK, 1)
    cols = [
        (36, 306, "TECHNOLOGY", "Anthropic IPO: $81.3bn",
         "Biggest stock market debut ever.", "bars"),
        (366, 292, "DIPLOMACY", "Trump, Xi & Putin Meet",
         "Trilateral talks in Shenzhen, China.", "globe"),
        (682, 306, "POLITICS", "Jeffries Makes History",
         "First Black nominee for US House Speaker.", "capitol"),
    ]
    for (cx, cw, kick, title, sub, kind) in cols:
        d.text((cx, 676), kick, font=load_font(SANS_B, 17), fill=VERM)
        if kind == "bars":
            draw_bars(d, cx + 20, 760)
        elif kind == "globe":
            draw_globe(d, cx + cw // 2, 734, 30)
        else:
            draw_capitol(d, cx + 18, 760)
        tf = load_font(SERIF_B, 29)
        tlines = wrap(d, title, tf, cw)
        draw_lines(d, cx, 774, tlines, tf, INK, 33)
        sf = load_font(SANS, 17)
        slines = wrap(d, sub, sf, cw)
        draw_lines(d, cx, 846, slines, sf, INK, 21)

    hline(d, 36, 988, 896, INK, 2)

    # Bottom row: space and weather.
    vline(d, 512, 906, 970, INK, 1)
    draw_voyager(d, rng, 36, 906, 156, 970)
    d.text((168, 906), "SPACE", font=load_font(SANS_B, 15), fill=VERM)
    d.text((168, 928), "Voyager 1: One Light-Day", font=load_font(SERIF_B, 22), fill=INK)
    d.text((168, 954), "Farthest human object, 50 years on.",
           font=load_font(SANS, 16), fill=INK)
    draw_cyclone(d, 584, 930)
    d.text((656, 906), "WEATHER", font=load_font(SANS_B, 15), fill=VERM)
    d.text((656, 928), "Cyclone Akvan Nears India", font=load_font(SERIF_B, 22), fill=INK)
    d.text((656, 954), "50,000 evacuated in Odisha.",
           font=load_font(SANS, 16), fill=INK)

    # Footer.
    hline(d, 36, 988, 980, INK, 2)
    centered(d, 512, 986, "All six stories first reported on 19 November 2026 · The World Bulletin · Page 1",
             load_font(SANS, 14), INK)

    # Newsprint grain over the whole page, seeded so it is identical each run.
    for _ in range(2600):
        x = rng.randint(24, 1000)
        y = rng.randint(24, 1000)
        c = SPECK_DARK if rng.random() < 0.55 else SPECK_LT
        d.point((x, y), fill=c)

    img.save(out_path, format="PNG", optimize=False)

def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "/output"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "entry.png")
    build(out_path)
    print("wrote " + out_path)

main()
`;

function main(): void {
  const outDir = path.resolve(OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulletin-"));
  const script = path.join(tmp, "draw.py");
  fs.writeFileSync(script, PY, "utf8");
  try {
    execFileSync("python3", [script, outDir], { stdio: "inherit" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const out = path.join(outDir, "entry.png");
  const stat = fs.statSync(out);
  console.log(`wrote ${out} (${stat.size} bytes)`);
}

main();

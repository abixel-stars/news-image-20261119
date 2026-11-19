import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const TARGET = join(OUT_DIR, "entry.png");

const DRAW_PY = `import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

W = 1024
H = 1024
OUT_PATH = os.path.join(sys.argv[1], "entry.png")

PAPER = (243, 233, 207)
INK = (26, 23, 18)
RED = (178, 34, 24)
TEAL = (23, 92, 86)
CREAM = (247, 240, 218)
SPECK = (226, 214, 186)
SPECK_D = (110, 98, 72)

SERIF_BLACK = "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Black.ttf"
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_IT = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SANS = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
SANS_B = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"

def load_fonts():
    try:
        return {
            "mast": ImageFont.truetype(SERIF_BLACK, 58),
            "lead": ImageFont.truetype(SERIF_BLACK, 62),
            "h2": ImageFont.truetype(SERIF_BLACK, 25),
            "h3": ImageFont.truetype(SERIF_BLACK, 26),
            "kick": ImageFont.truetype(SANS_B, 13),
            "kick_lead": ImageFont.truetype(SANS_B, 15),
            "deck": ImageFont.truetype(SERIF_IT, 19),
            "body": ImageFont.truetype(SERIF, 15),
            "cap": ImageFont.truetype(SERIF_IT, 13),
            "date": ImageFont.truetype(SANS_B, 16),
            "meta": ImageFont.truetype(SANS, 13),
            "meta_b": ImageFont.truetype(SANS_B, 13),
            "foot": ImageFont.truetype(SANS, 12),
        }
    except OSError:
        sys.exit(3)

def wrap(d, text, f, maxw):
    lines = []
    cur = ""
    for word in text.split(" "):
        trial = word if cur == "" else cur + " " + word
        if d.textlength(trial, font=f) <= maxw:
            cur = trial
        else:
            if cur != "":
                lines.append(cur)
            cur = word
    if cur != "":
        lines.append(cur)
    return lines

def tracked(d, x, y, text, f, fill, tr):
    cx = x
    for ch in text:
        d.text((cx, y), ch, font=f, fill=fill)
        cx += d.textlength(ch, font=f) + tr
    return cx - tr

def tracked_width(d, text, f, tr):
    total = 0
    for ch in text:
        total += d.textlength(ch, font=f) + tr
    return total - tr

def tracked_center(d, cx, y, text, f, fill, tr):
    w = tracked_width(d, text, f, tr)
    tracked(d, cx - w / 2, y, text, f, fill, tr)

def halftone_sky(d, x0, y0, x1, y1):
    spacing = 9
    row = 0
    yy = y0
    while yy <= y1:
        xx = x0 + (4 if row % 2 else 0)
        while xx <= x1:
            t = (yy - y0) / (y1 - y0)
            r = 0.4 + 2.6 * t * t
            if r > 0.5:
                d.ellipse([xx - r, yy - r, xx + r, yy + r], fill=RED)
            xx += spacing
        yy += spacing
        row += 1

def skyline(d, x0, x1, ground, seed):
    rng = random.Random(seed)
    x = x0
    bi = 0
    while x < x1:
        bw = rng.randrange(46, 88)
        if x + bw > x1:
            bw = x1 - x
        bh = rng.randrange(55, 105)
        top = ground - bh
        d.rectangle([x, top, x + bw, ground], fill=INK)
        wy = top + 12
        row = 0
        while wy < ground - 10:
            wx = x + 9
            col = 0
            while wx < x + bw - 8:
                if (row + col + bi) % 3 == 0:
                    d.rectangle([wx, wy, wx + 3, wy + 5], fill=CREAM)
                wx += 11
                col += 1
            wy += 12
            row += 1
        if bi % 4 == 1:
            ax = x + bw // 2
            d.line([(ax, top), (ax, top - 16)], fill=INK, width=2)
            d.ellipse([ax - 2, top - 20, ax + 2, top - 16], fill=RED)
        x += bw
        bi += 1

def palm(d, bx, by, lean, s):
    pts = []
    for i in range(9):
        t = i / 8
        px = bx + lean * t * t
        py = by - 78 * s * t
        pts.append((px, py))
    d.line(pts, fill=INK, width=6)
    cx = bx + lean
    cy = by - 78 * s
    for ang, droop, ln in [(205, 26, 62), (235, 20, 66), (262, 14, 60), (290, 14, 60), (318, 20, 64), (345, 26, 58)]:
        a = math.radians(ang)
        fpts = []
        for i in range(8):
            t = i / 7
            fx = cx + math.cos(a) * ln * s * t
            fy = cy + math.sin(a) * ln * s * t + droop * s * t * t
            fpts.append((fx, fy))
        d.line(fpts, fill=INK, width=4)

def lead_art(d):
    x0, y0, x1, y1 = 36, 380, 988, 556
    d.rectangle([x0, y0, x1, y1], outline=INK, width=2)
    halftone_sky(d, x0 + 4, y0 + 4, x1 - 4, y1 - 22)
    sx, sy, sr = 690, 438, 40
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=RED)
    for dy in (-8, 6):
        hw = math.sqrt(sr * sr - dy * dy)
        d.rectangle([sx - hw, sy + dy, sx + hw, sy + dy + 3], fill=CREAM)
    for bx, by in [(300, 420), (348, 406), (268, 448)]:
        d.line([(bx - 7, by), (bx, by - 4), (bx + 7, by)], fill=INK, width=2)
    skyline(d, x0 + 2, x1 - 2, 540, 7)
    palm(d, 150, 540, -14, 1.15)
    palm(d, 880, 540, 12, 1.0)
    d.rectangle([x0 + 2, 540, x1 - 2, y1 - 2], fill=INK)
    car = [(430, 551), (436, 541), (452, 537), (486, 537), (500, 543), (508, 551)]
    d.polygon(car, fill=CREAM)
    d.polygon([(452, 541), (462, 541), (462, 547), (452, 547)], fill=INK)
    d.polygon([(468, 541), (482, 541), (482, 547), (468, 547)], fill=INK)
    d.ellipse([440, 547, 452, 555], fill=INK)
    d.ellipse([488, 547, 500, 555], fill=INK)
    d.ellipse([443, 550, 449, 555], fill=CREAM)
    d.ellipse([491, 550, 497, 555], fill=CREAM)

def chart(d, x, y):
    d.line([(x + 8, y + 58), (x + 296, y + 58)], fill=INK, width=2)
    for bx, bh in [(30, 20), (100, 36), (170, 54)]:
        d.rectangle([x + bx, y + 58 - bh, x + bx + 46, y + 58], fill=INK)
    d.line([(x + 20, y + 46), (x + 250, y + 6)], fill=RED, width=4)
    d.polygon([(x + 250, y + 6), (x + 232, y + 4), (x + 246, y + 20)], fill=RED)
    for tx in (30, 100, 170):
        d.line([(x + tx + 23, y + 58), (x + tx + 23, y + 62)], fill=INK, width=2)

def globe(d, x, y):
    cx, cy, r = x + 152, y + 32, 30
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=2)
    d.ellipse([cx - 13, cy - r, cx + 13, cy + r], outline=INK, width=1)
    for dy in (-15, 0, 15):
        hw = int(math.sqrt(r * r - dy * dy)) - 1
        d.line([(cx - hw, cy + dy), (cx + hw, cy + dy)], fill=INK, width=1)
    for px, py in [(cx - 14, cy - 12), (cx + 10, cy - 16), (cx + 16, cy + 10)]:
        d.line([(px, py), (px, py - 6)], fill=RED, width=2)
        d.ellipse([px - 3, py - 9, px + 3, py - 3], fill=RED)
    d.arc([cx - 46, cy - 16, cx + 46, cy + 16], 300, 360, fill=TEAL, width=2)
    d.arc([cx - 46, cy - 16, cx + 46, cy + 16], 0, 60, fill=TEAL, width=2)

def capitol(d, x, y):
    cx = x + 152
    d.arc([cx - 46, y + 12, cx + 46, y + 58], 180, 360, fill=INK, width=3)
    d.line([(cx, y + 12), (cx, y + 2)], fill=INK, width=2)
    d.polygon([(cx, y + 2), (cx + 14, y + 5), (cx, y + 8)], fill=RED)
    for i in range(5):
        colx = cx - 40 + i * 18
        d.rectangle([colx, y + 38, colx + 8, y + 58], fill=INK)
    d.line([(cx - 52, y + 60), (cx + 52, y + 60)], fill=INK, width=2)

def voyager(d, x, y):
    d.rounded_rectangle([x, y, x + 150, y + 108], radius=6, fill=INK)
    rng = random.Random(99)
    for _ in range(16):
        sx = x + rng.randrange(6, 144)
        sy = y + rng.randrange(6, 102)
        r = rng.choice([1, 1, 2])
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=CREAM)
    p0 = (x + 16, y + 94)
    pc = (x + 28, y + 56)
    p1 = (x + 64, y + 62)
    for i in range(13):
        t = i / 12
        qx = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * pc[0] + t * t * p1[0]
        qy = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * pc[1] + t * t * p1[1]
        d.ellipse([qx - 2, qy - 2, qx + 2, qy + 2], fill=CREAM)
    d.rectangle([x + 88, y + 48, x + 104, y + 60], fill=CREAM)
    d.polygon([(x + 104, y + 44), (x + 126, y + 34), (x + 126, y + 62)], fill=CREAM)
    d.line([(x + 88, y + 54), (x + 62, y + 64)], fill=CREAM, width=2)
    d.line([(x + 96, y + 48), (x + 96, y + 34)], fill=CREAM, width=2)
    d.ellipse([x + 94, y + 32, x + 98, y + 36], fill=CREAM)
    d.ellipse([x + 132, y + 14, x + 138, y + 20], fill=RED)

def cyclone(d, x, y):
    cx, cy = x + 75, y + 46
    pts = []
    t = 0.0
    while t <= 4.4 * math.pi:
        r = 2 + 2.4 * t
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t) * 0.92))
        t += 0.12
    d.line(pts, fill=INK, width=3)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=RED)
    for rx in [x + 18, x + 48, x + 78, x + 108, x + 132]:
        d.line([(rx, y + 88), (rx - 4, y + 100)], fill=INK, width=2)
    d.line([(x + 8, y + 12), (x + 40, y + 12)], fill=INK, width=2)
    d.line([(x + 110, y + 16), (x + 142, y + 16)], fill=INK, width=2)

def main():
    f = load_fonts()
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([12, 12, 1011, 1011], outline=INK, width=3)
    d.rectangle([19, 19, 1004, 1004], outline=INK, width=1)
    mw = d.textlength("THE WORLD BULLETIN", font=f["mast"])
    d.text(((W - mw) / 2, 28), "THE WORLD BULLETIN", font=f["mast"], fill=INK)
    d.line([(36, 102), (988, 102)], fill=INK, width=1)
    d.text((36, 110), "No. 324", font=f["meta"], fill=INK)
    tracked_center(d, 512, 108, "THURSDAY, 19 NOVEMBER 2026", f["date"], INK, 2)
    rw = d.textlength("PRICE $1.50", font=f["meta_b"])
    d.text((988 - rw, 110), "PRICE $1.50", font=f["meta_b"], fill=INK)
    d.rectangle([36, 136, 988, 140], fill=INK)
    d.line([(36, 146), (988, 146)], fill=INK, width=1)
    d.text((36, 152), "WEATHER: VICE CITY 28\u00b0 CLEAR \u00b7 NEW YORK 12\u00b0 \u00b7 LONDON 9\u00b0", font=f["meta"], fill=TEAL)
    op = "OPINION: THE DAY GAMES GREW UP"
    ow = d.textlength(op, font=f["meta_b"])
    d.text((988 - ow, 152), op, font=f["meta_b"], fill=INK)
    tracked(d, 36, 176, "VICE CITY AWAITS \u00b7 OUT TODAY", f["kick_lead"], RED, 3)
    d.text((36, 198), "GTA VI LAUNCHES", font=f["lead"], fill=INK)
    d.text((36, 262), "WORLDWIDE", font=f["lead"], fill=INK)
    deck_lines = wrap(d, "Gamers enter Vice City as the biggest game launch in history rolls out across the world today.", f["deck"], 952)
    dy = 334
    for ln in deck_lines:
        d.text((36, dy), ln, font=f["deck"], fill=INK)
        dy += 22
    lead_art(d)
    d.text((36, 564), "Sunset over Vice City: players take to the streets as the game opens worldwide today.", font=f["cap"], fill=INK)
    d.line([(36, 594), (988, 594)], fill=INK, width=2)
    cols = [
        (36, "TECHNOLOGY", "Anthropic IPO: $81.3bn", "Biggest stock market debut ever.", "chart"),
        (360, "DIPLOMACY", "Trump, Xi & Putin Meet", "Trilateral talks in Shenzhen, China.", "globe"),
        (684, "POLITICS", "Jeffries Makes History", "First Black nominee for US House Speaker.", "capitol"),
    ]
    for cx, kick, head, body, art in cols:
        tracked(d, cx, 604, kick, f["kick"], RED, 2)
        if art == "chart":
            chart(d, cx, 626)
        elif art == "globe":
            globe(d, cx, 626)
        else:
            capitol(d, cx, 626)
        hl = wrap(d, head, f["h2"], 304)
        hy = 696
        for ln in hl:
            d.text((cx, hy), ln, font=f["h2"], fill=INK)
            hy += 27
        bl = wrap(d, body, f["body"], 304)
        by = 754
        for ln in bl:
            d.text((cx, by), ln, font=f["body"], fill=INK)
            by += 17
    d.line([(350, 604), (350, 796)], fill=INK, width=1)
    d.line([(674, 604), (674, 796)], fill=INK, width=1)
    d.line([(36, 808), (988, 808)], fill=INK, width=2)
    d.line([(512, 818), (512, 953)], fill=INK, width=1)
    tracked(d, 36, 818, "SPACE", f["kick"], RED, 2)
    voyager(d, 36, 844)
    hl = wrap(d, "Voyager 1: One Light-Day", f["h3"], 306)
    hy = 844
    for ln in hl:
        d.text((196, hy), ln, font=f["h3"], fill=INK)
        hy += 28
    bl = wrap(d, "Farthest human object, 50 years on.", f["body"], 306)
    by = 902
    for ln in bl:
        d.text((196, by), ln, font=f["body"], fill=INK)
        by += 17
    tracked(d, 522, 818, "WEATHER", f["kick"], RED, 2)
    cyclone(d, 522, 844)
    hl = wrap(d, "Cyclone Akvan Nears India", f["h3"], 306)
    hy = 844
    for ln in hl:
        d.text((682, hy), ln, font=f["h3"], fill=INK)
        hy += 28
    bl = wrap(d, "50,000 evacuated in Odisha.", f["body"], 306)
    by = 902
    for ln in bl:
        d.text((682, by), ln, font=f["body"], fill=INK)
        by += 17
    d.line([(36, 968), (988, 968)], fill=INK, width=2)
    foot = "All six stories first reported on 19 November 2026  \u00b7  The World Bulletin  \u00b7  Page 1"
    fw = d.textlength(foot, font=f["foot"])
    d.text(((W - fw) / 2, 976), foot, font=f["foot"], fill=INK)
    grng = random.Random(20261119)
    for _ in range(3800):
        gx = grng.randrange(8, 1016)
        gy = grng.randrange(8, 1016)
        c = SPECK if grng.random() < 0.75 else SPECK_D
        d.point((gx, gy), fill=c)
    for _ in range(150):
        gx = grng.randrange(8, 1014)
        gy = grng.randrange(8, 1014)
        d.rectangle([gx, gy, gx + 1, gy + 1], fill=SPECK)
    img.save(OUT_PATH, "PNG")

main()
`;

function drawWithPython(): boolean {
  const scriptPath = join(tmpdir(), "world-bulletin-draw.py");
  try {
    writeFileSync(scriptPath, DRAW_PY, "utf8");
  } catch {
    return false;
  }
  const run = spawnSync("python3", [scriptPath, OUT_DIR], { encoding: "utf8" });
  if (run.error || run.status !== 0) return false;
  return existsSync(TARGET);
}

function copyShipped(): boolean {
  const shipped = join(HERE, "entry.png");
  if (!existsSync(shipped)) return false;
  try {
    copyFileSync(shipped, TARGET);
    return true;
  } catch {
    return false;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
if (!drawWithPython()) {
  if (!copyShipped()) {
    throw new Error("could not produce entry.png");
  }
}

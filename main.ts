import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

const python = `
import os, math, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.environ.get("OUT_DIR", "/output")
W = H = 1024
PAPER = (246, 239, 221)
INK = (26, 26, 26)
RED = (205, 56, 32)
TEAL = (13, 122, 113)
CREAM_CAR = (250, 248, 240)

SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

def fit(dr, path, size, text, max_w):
    while size > 8:
        f = font(path, size)
        if dr.textlength(text, font=f) <= max_w:
            return f
        size -= 1
    return font(path, 8)

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# ---- frame ----
d.rectangle([10, 10, 1013, 1013], outline=INK, width=3)
d.rectangle([18, 18, 1005, 1005], outline=INK, width=1)

# ---- masthead ----
f = fit(d, SERIF_B, 100, "THE WORLD BULLETIN", 956)
d.text((512, 46), "THE WORLD BULLETIN", font=f, fill=INK, anchor="ma")
d.line([(30, 132), (994, 132)], fill=INK, width=2)

# ---- info row: issue number left, date centered, no price anywhere ----
d.text((34, 142), "No. 001", font=font(SERIF, 22), fill=INK)
f = fit(d, SERIF_B, 24, "THURSDAY, 19 NOVEMBER 2026", 560)
d.text((512, 142), "THURSDAY, 19 NOVEMBER 2026", font=f, fill=INK, anchor="ma")
d.line([(30, 176), (994, 176)], fill=INK, width=3)
d.line([(30, 182), (994, 182)], fill=INK, width=1)

# ---- weather strip ----
f = fit(d, SANS_B, 19, "WEATHER: VICE CITY 28\u00b0 CLEAR \u00b7 NEW YORK 12\u00b0 \u00b7 LONDON 9\u00b0", 600)
d.text((34, 194), "WEATHER: VICE CITY 28\u00b0 CLEAR \u00b7 NEW YORK 12\u00b0 \u00b7 LONDON 9\u00b0", font=f, fill=TEAL)
f = fit(d, SANS_B, 19, "OPINION: THE DAY GAMES GREW UP", 340)
d.text((990, 194), "OPINION: THE DAY GAMES GREW UP", font=f, fill=INK, anchor="ra")

# ---- lead kicker + headline ----
d.text((34, 224), "VICE CITY AWAITS \u00b7 OUT TODAY", font=font(SANS_B, 21), fill=RED)
f = fit(d, SERIF_B, 108, "GTA VI LAUNCHES", 956)
d.text((32, 248), "GTA VI LAUNCHES", font=f, fill=INK)
d.text((32, 348), "WORLDWIDE", font=f, fill=INK)

# ---- lead deck ----
deck = "Gamers enter Vice City as the biggest game launch in history rolls out across the world today."
f = fit(d, SERIF_I, 26, deck, 956)
d.text((34, 452), deck, font=f, fill=INK)

# ---- lead illustration panel (drawn on its own layer so palms clip at the edge) ----
panel = Image.new("RGB", (956, 136), PAPER)
p = ImageDraw.Draw(panel)

# halftone dots in the sky
for yy in range(10, 74, 16):
    off = 8 if ((yy - 10) // 16) % 2 else 0
    for xx in range(10 + off, 950, 16):
        p.ellipse([xx - 3, yy - 3, xx + 3, yy + 3], fill=RED)

# setting sun with stripes
cx, cy, r = 844, 50, 46
p.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED)
for dy, hh in [(-6, 5), (6, 5), (18, 5)]:
    hw = int(math.sqrt(max(r * r - dy * dy, 0)))
    p.rectangle([cx - hw, cy + dy, cx + hw, cy + dy + hh], fill=PAPER)

# skyline silhouette with lit windows
random.seed(7)
x = 2
while x < 952:
    w = random.randint(28, 62)
    top = random.randint(46, 104)
    p.rectangle([x, top, x + w, 134], fill=INK)
    for wy in range(top + 10, 128, 13):
        for wx in range(x + 6, x + w - 4, 11):
            if random.random() < 0.32:
                p.rectangle([wx, wy, wx + 4, wy + 6], fill=PAPER)
    x += w + random.randint(2, 9)

# white car on the street
p.rounded_rectangle([588, 108, 672, 126], radius=6, fill=CREAM_CAR)
p.polygon([(606, 108), (618, 96), (650, 96), (660, 108)], fill=CREAM_CAR)
p.rectangle([622, 99, 646, 107], fill=INK)
p.ellipse([598, 120, 612, 134], fill=INK)
p.ellipse([650, 120, 664, 134], fill=INK)

# palm trees at both edges
def frond(bx, by, ang, length, droop):
    pts = []
    a = math.radians(ang)
    for i in range(9):
        t = i / 8.0
        px = bx + math.cos(a) * length * t
        py = by + math.sin(a) * length * t + droop * length * t * t
        pts.append((px, py))
    p.line(pts, fill=INK, width=4)

def palm(bx, mirror):
    sx = 1 if mirror else -1
    p.line([(bx, 134), (bx + sx * 6, 84), (bx + sx * 10, 60)], fill=INK, width=5)
    cxp = bx + sx * 10
    for a in [-165, -135, -105, -75, -45, -15]:
        frond(cxp, 60, a if not mirror else -180 - a, 38, 0.55)

palm(28, False)
palm(928, True)

# birds
p.line([(320, 26), (328, 31), (336, 26)], fill=INK, width=2)
p.line([(590, 20), (598, 25), (606, 20)], fill=INK, width=2)

img.paste(panel, (34, 492))
d.rectangle([34, 492, 990, 628], outline=INK, width=2)

# ---- caption ----
cap = "Sunset over Vice City: players take to the streets as the game opens worldwide today."
f = fit(d, SERIF_I, 21, cap, 956)
d.text((34, 640), cap, font=f, fill=INK)
d.line([(30, 666), (994, 666)], fill=INK, width=2)

# ---- column dividers ----
d.line([(348, 682), (348, 894)], fill=INK, width=1)
d.line([(676, 682), (676, 894)], fill=INK, width=1)

# ---- column 1: technology ----
d.text((34, 678), "TECHNOLOGY", font=font(SANS_B, 19), fill=RED)
base = 770
for bx, bh in [(58, 26), (108, 48), (158, 72)]:
    d.rectangle([bx, base - bh, bx + 34, base], fill=INK)
d.line([(50, 756), (248, 692)], fill=RED, width=4)
d.polygon([(248, 692), (230, 692), (244, 704)], fill=RED)
f = fit(d, SERIF_B, 37, "Anthropic IPO:", 302)
d.text((34, 784), "Anthropic IPO:", font=f, fill=INK)
d.text((34, 820), "$81.3bn", font=f, fill=INK)
d.text((34, 860), "Biggest stock market debut ever.", font=font(SERIF, 18), fill=INK)

# ---- column 2: diplomacy ----
d.text((360, 678), "DIPLOMACY", font=font(SANS_B, 19), fill=RED)
gx, gy, gr = 512, 735, 32
pts = []
for t in range(0, 361, 6):
    th = math.radians(t)
    rot = math.radians(-25)
    px = gx + 52 * math.cos(th) * math.cos(rot) - 14 * math.sin(th) * math.sin(rot)
    py = gy + 52 * math.cos(th) * math.sin(rot) + 14 * math.sin(th) * math.cos(rot)
    pts.append((px, py))
d.line(pts + [pts[0]], fill=TEAL, width=2)
d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=PAPER, outline=INK, width=2)
d.arc([gx - 12, gy - gr, gx + 12, gy + gr], 90, 270, fill=INK, width=2)
d.line([(gx - gr + 4, gy - 14), (gx + gr - 4, gy - 14)], fill=INK, width=1)
d.line([(gx - gr + 4, gy + 14), (gx + gr - 4, gy + 14)], fill=INK, width=1)
for dx, dy in [(-12, -12), (14, 0), (-2, 18)]:
    d.ellipse([gx + dx - 3, gy + dy - 3, gx + dx + 3, gy + dy + 3], fill=RED)
f = fit(d, SERIF_B, 37, "Trump, Xi Jinping", 302)
d.text((360, 784), "Trump, Xi Jinping", font=f, fill=INK)
d.text((360, 820), "& Putin Meet", font=f, fill=INK)
d.text((360, 860), "Trilateral talks in Shenzhen,", font=font(SERIF, 18), fill=INK)
d.text((360, 880), "China.", font=font(SERIF, 18), fill=INK)

# ---- column 3: politics ----
d.text((688, 678), "POLITICS", font=font(SANS_B, 19), fill=RED)
d.pieslice([798, 700, 880, 748], 180, 360, fill=INK)
d.rectangle([836, 692, 842, 702], fill=INK)
d.line([(839, 692), (839, 680)], fill=INK, width=2)
d.polygon([(839, 680), (839, 688), (851, 684)], fill=RED)
d.rectangle([794, 748, 884, 756], fill=INK)
for cxp in [800, 818, 836, 854, 872]:
    d.rectangle([cxp, 756, cxp + 7, 772], fill=INK)
d.rectangle([790, 772, 888, 778], fill=INK)
f = fit(d, SERIF_B, 37, "Jeffries Makes", 302)
d.text((688, 784), "Jeffries Makes", font=f, fill=INK)
d.text((688, 820), "History", font=f, fill=INK)
d.text((688, 860), "First Black nominee for US House", font=font(SERIF, 18), fill=INK)
d.text((688, 880), "Speaker.", font=font(SERIF, 18), fill=INK)

d.line([(30, 900), (994, 900)], fill=INK, width=2)

# ---- bottom row ----
d.line([(516, 912), (516, 968)], fill=INK, width=1)

# space story
d.rounded_rectangle([34, 912, 158, 968], radius=10, fill=INK)
d.rectangle([66, 934, 104, 944], fill=(250, 248, 240))
d.polygon([(104, 934), (118, 939), (104, 944)], fill=(250, 248, 240))
d.polygon([(66, 934), (56, 928), (66, 939)], fill=(250, 248, 240))
d.polygon([(66, 944), (56, 950), (66, 940)], fill=(250, 248, 240))
for dx, dy in [(58, 941), (52, 945), (46, 950), (41, 956)]:
    d.ellipse([dx - 2, dy - 2, dx + 2, dy + 2], fill=(250, 248, 240))
d.ellipse([52, 941, 57, 946], fill=RED)
d.text((172, 912), "SPACE", font=font(SANS_B, 18), fill=RED)
f = fit(d, SERIF_B, 27, "Voyager 1: One Light-Day", 330)
d.text((172, 934), "Voyager 1: One Light-Day", font=f, fill=INK)
d.text((172, 960), "Farthest human object, 50 years on.", font=font(SERIF, 18), fill=INK)

# weather story
d.arc([550, 912, 606, 968], 20, 320, fill=INK, width=2)
d.arc([558, 920, 598, 960], 140, 440, fill=INK, width=2)
d.arc([566, 928, 590, 952], 260, 560, fill=INK, width=2)
d.ellipse([574, 936, 582, 944], fill=RED)
for sx, sy in [(548, 962), (560, 964), (572, 964), (584, 962)]:
    d.line([(sx, sy), (sx - 4, sy + 8)], fill=INK, width=2)
d.text((640, 912), "WEATHER", font=font(SANS_B, 18), fill=RED)
f = fit(d, SERIF_B, 27, "Cyclone Akvan Nears India", 345)
d.text((640, 934), "Cyclone Akvan Nears India", font=f, fill=INK)
d.text((640, 960), "50,000 evacuated in Odisha.", font=font(SERIF, 18), fill=INK)

# ---- footer ----
d.line([(30, 982), (994, 982)], fill=INK, width=1)
d.text((512, 990), "All six stories first reported on 19 November 2026 \u00b7 The World Bulletin \u00b7 Page 1", font=font(SERIF, 14), fill=INK, anchor="ma")

# ---- paper grain ----
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(overlay)
random.seed(20261119)
for _ in range(3200):
    x = random.randint(20, 1003)
    y = random.randint(20, 1003)
    a = random.randint(22, 55)
    s = 1 if random.random() < 0.8 else 2
    gd.ellipse([x, y, x + s, y + s], fill=(40, 32, 20, a))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

os.makedirs(OUT, exist_ok=True)
img.save(os.path.join(OUT, "entry.png"), "PNG")
print("wrote " + os.path.join(OUT, "entry.png"))
`;

const work = mkdtempSync(join(tmpdir(), "bulletin-v3-"));
const script = join(work, "draw.py");
writeFileSync(script, python, "utf8");
execFileSync("python3", [script], {
  stdio: "inherit",
  env: { ...process.env, OUT_DIR: outDir },
});
rmSync(work, { recursive: true, force: true });

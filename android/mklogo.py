#!/usr/bin/env python3
"""يرسم شعار Sawah ERP من رمز شاشة الدخول (الأعمدة والحلقة والآلة الحاسبة والعملات).
الاستخدام: python3 mklogo.py <صورة التصميم الأصلية> <مجلد الإخراج>
الناتج: icon-1024.png (أيقونة التطبيق) و logo-wide.png (الشعار بالاسم) و logo-mark.png (الرمز بخلفية شفافة)"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
F_BLACK = '/usr/share/fonts/opentype/inter/InterDisplay-Black.otf'
F_SEMI = '/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf'
GOLD_TOP, GOLD_BOT = (255, 214, 102), (214, 150, 30)
NAVY_TOP, NAVY_BOT = (17, 88, 214), (6, 36, 112)

src = Image.open(SRC).convert('RGB')
emblem = src.crop((160, 145, 680, 485)).resize((1040, 680), Image.LANCZOS)
# لون الخلفية مأخوذ من حواف الرمز نفسه حتى لا يظهر مربع حوله
def edge_avg(img, rows):
    px = [img.getpixel((x, y)) for y in rows for x in range(0, img.width, 8)]
    return tuple(sum(p[i] for p in px) // len(px) for i in range(3))
NAVY_TOP = edge_avg(emblem, range(0, 6))
NAVY_BOT = tuple(max(0, int(c * .72)) for c in edge_avg(emblem, range(emblem.height - 6, emblem.height)))


def vgrad(w, h, top, bot):
    g = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        g.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return g.resize((w, h))


def feather(img, rx=0.16, ry=0.2):
    """قناع ناعم الحواف حتى يندمج الرمز مع الخلفية"""
    w, h = img.size
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([int(w * rx * .5), int(h * ry * .5), int(w * (1 - rx * .5)), int(h * (1 - ry * .5))], radius=int(min(w, h) * .3), fill=255)
    return m.filter(ImageFilter.GaussianBlur(min(w, h) * .07))


def text_grad(draw_size, text, font, top, bot):
    w, h = draw_size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text((0, 0), text, font=font, fill=255)
    return Image.composite(vgrad(w, h, top, bot), Image.new('RGB', (w, h)), mask), mask


def place_text(canvas, xy, text, font, top=None, bot=None, color=None, shadow=True):
    bbox = font.getbbox(text)
    w, h = bbox[2] + 4, bbox[3] + 8
    if color:
        layer = Image.new('RGB', (w, h), color); mask = Image.new('L', (w, h), 0)
        ImageDraw.Draw(mask).text((0, 0), text, font=font, fill=255)
    else:
        layer, mask = text_grad((w, h), text, font, top, bot)
    if shadow:
        sh = mask.filter(ImageFilter.GaussianBlur(6)).point(lambda v: v * .55)
        canvas.paste((0, 12, 40), (xy[0] + 3, xy[1] + 6), sh)
    canvas.paste(layer, xy, mask)
    return w


# ---------- 1) أيقونة التطبيق 1024×1024 ----------
S = 1024
bg = vgrad(S, S, NAVY_TOP, NAVY_BOT)
# لمعة خفيفة أعلى الأيقونة
glow = Image.new('L', (S, S), 0); ImageDraw.Draw(glow).ellipse([-200, -520, S + 200, 430], fill=70)

e = emblem.resize((880, 575), Image.LANCZOS)
bg.paste(e, ((S - 880) // 2, 120), feather(e))
font = ImageFont.truetype(F_BLACK, 150)
tw = font.getbbox('Sawah')[2]
place_text(bg, ((S - tw) // 2, 690), 'Sawah', font, color=(255, 255, 255))
f2 = ImageFont.truetype(F_BLACK, 92)
tw2 = f2.getbbox('ERP')[2]
place_text(bg, ((S - tw2) // 2, 862), 'ERP', f2, GOLD_TOP, GOLD_BOT)
mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=230, fill=255)
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0)); icon.paste(bg, (0, 0), mask)
icon.save(f'{OUT}/icon-1024.png')
icon.resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-512.png')

# ---------- 2) الشعار العريض بالاسم ----------
W, H = 1800, 600
wide = vgrad(W, H, NAVY_TOP, NAVY_BOT)
g2 = Image.new('L', (W, H), 0); ImageDraw.Draw(g2).ellipse([-300, -500, W + 300, 260], fill=60)

e2 = emblem.resize((760, 497), Image.LANCZOS)
wide.paste(e2, (40, (H - 497) // 2), feather(e2))
fb = ImageFont.truetype(F_BLACK, 168)
x = 820
w1 = place_text(wide, (x, 150), 'Sawah', fb, color=(255, 255, 255))
place_text(wide, (x + w1 + 26, 150), 'ERP', fb, GOLD_TOP, GOLD_BOT)
fs = ImageFont.truetype(F_SEMI, 62)
d = ImageDraw.Draw(wide)
d.line([(x + 4, 420), (x + 70, 420)], fill=(150, 200, 255), width=4)
place_text(wide, (x + 90, 382), 'Accounting Made Easy', fs, color=(214, 232, 255), shadow=False)
wm = Image.new('L', (W, H), 0); ImageDraw.Draw(wm).rounded_rectangle([0, 0, W - 1, H - 1], radius=60, fill=255)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(wide, (0, 0), wm)
out.save(f'{OUT}/logo-wide.png')
print('ok', OUT)

# ---------- 3) أيقونة متكيفة لأندرويد 8+ (خلفية + رمز) وأيقونة كاملة للإصدارات الأقدم ----------
A = 432  # 108dp × 4 (xxxhdpi)
# خلفية شعاعية: مركزها بلون خلفية الرمز نفسه، وأطرافها أغمق — حتى يندمج الرمز بلا حدود ظاهرة
def border_avg(img):
    w, h = img.size; px = [img.getpixel((x, y)) for x in range(0, w, 6) for y in (2, h - 3)] + [img.getpixel((x, y)) for y in range(0, h, 6) for x in (2, w - 3)]
    return tuple(sum(p[i] for p in px) // len(px) for i in range(3))
CEN = border_avg(emblem); EDGE = tuple(int(c * .55) for c in CEN)
abg = Image.new('RGB', (A, A))
import math
for y in range(A):
    for x in range(A):
        t = min(1, math.hypot(x - A / 2, y - A / 2) / (A * .62))
        abg.putpixel((x, y), tuple(int(CEN[i] + (EDGE[i] - CEN[i]) * t * t) for i in range(3)))
abg.save(f'{OUT}/ic-bg.png')
# الرمز داخل المنطقة الآمنة (66dp من 108dp) حتى لا يقصّه شكل الأيقونة في أي جهاز
fg = Image.new('RGBA', (A, A), (0, 0, 0, 0))
ew = 330; eh = int(ew * emblem.height / emblem.width)
e3 = emblem.resize((ew, eh), Image.LANCZOS).convert('RGBA')
m3 = Image.new('L', (ew, eh), 0); ImageDraw.Draw(m3).rounded_rectangle([6, 4, ew - 7, eh - 5], radius=40, fill=255)
e3.putalpha(m3.filter(ImageFilter.GaussianBlur(14)))
fg.paste(e3, ((A - ew) // 2, (A - eh) // 2), e3)
fg.save(f'{OUT}/ic-fg.png')
# أيقونة كاملة مربعة (بدون زوايا شفافة) للأجهزة الأقدم
leg = abg.copy().convert('RGBA'); leg.alpha_composite(fg)
legm = Image.new('L', (A, A), 0); ImageDraw.Draw(legm).rounded_rectangle([0, 0, A - 1, A - 1], radius=96, fill=255)
lg = Image.new('RGBA', (A, A), (0, 0, 0, 0)); lg.paste(leg, (0, 0), legm)
lg.save(f'{OUT}/ic-legacy.png')

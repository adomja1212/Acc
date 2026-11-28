#!/usr/bin/env python3
"""صورة شاشة الدخول: تُقص من التصميم الأصلي ويُستبدل عنوان "Sawah System" بـ "Sawah ERP" بنفس الألوان والمكان.
الاستخدام: python3 mkhero.py <صورة التصميم الأصلية> <ملف الإخراج login-hero.jpg>"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
F = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'
hero = Image.open(SRC).convert('RGB').crop((14, 104, 752, 1008))
W, H = hero.size

# 1) مسح العنوان القديم: كل عمود يُعاد بناؤه بالتدرج بين لون ما فوق العنوان وما تحته
Y0, Y1, X0, X1 = 378, 484, 40, W
px = hero.load()
for x in range(X0, X1):
    a, b = px[x, Y0 - 1], px[x, Y1 + 1]
    for y in range(Y0, Y1 + 1):
        t = (y - Y0) / (Y1 - Y0)
        px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
# تنعيم بسيط للمنطقة الممسوحة
band = hero.crop((X0, Y0 - 4, X1, Y1 + 4)).filter(ImageFilter.GaussianBlur(3))
hero.paste(band, (X0, Y0 - 4))

# 2) كتابة العنوان الجديد: Sawah بالأبيض و ERP بالذهبي، بظل ناعم مثل الأصل
font = ImageFont.truetype(F, 96)
w1 = font.getbbox('Sawah')[2]; gap = 24; w2 = font.getbbox('ERP')[2]
total = w1 + gap + w2
cx = 396
x = cx - total // 2; y = 368
shadow = Image.new('L', (W, H), 0); sd = ImageDraw.Draw(shadow)
sd.text((x + 3, y + 6), 'Sawah', font=font, fill=200); sd.text((x + w1 + gap + 3, y + 6), 'ERP', font=font, fill=200)
hero.paste((4, 20, 70), (0, 0), shadow.filter(ImageFilter.GaussianBlur(7)))
d = ImageDraw.Draw(hero)
d.text((x, y), 'Sawah', font=font, fill=(255, 255, 255))
# تدرج ذهبي لكلمة ERP
gm = Image.new('L', (W, H), 0); ImageDraw.Draw(gm).text((x + w1 + gap, y), 'ERP', font=font, fill=255)
gold = Image.new('RGB', (1, H))
for yy in range(H):
    t = min(1, max(0, (yy - (y + 20)) / 80))
    top, bot = (255, 222, 120), (214, 150, 34)
    gold.putpixel((0, yy), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
hero.paste(gold.resize((W, H)), (0, 0), gm)
hero.save(OUT, quality=84, optimize=True, progressive=True)
print('ok', OUT)

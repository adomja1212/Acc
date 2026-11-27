#!/usr/bin/env python3
"""يبني ملف APK غير موقّع لتطبيق "نظام المحاسب" بدون Android SDK:
يكتب AndroidManifest.xml و resources.arsc بالصيغة الثنائية، ويرسم الأيقونة، ثم يضغط كل شيء.
الاستخدام: python3 mkapk.py <classes.dex> <out-unsigned.apk> [versionCode] [versionName]
"""
import struct, sys, zipfile, io
from PIL import Image, ImageDraw, ImageFont

PKG = 'com.acc.erp'
LABEL = 'Sawah ERP'
ICON_ID = 0x7f010000
THEME_ID = 0x01030241  # @android:style/Theme.Material.Light.NoActionBar

A = dict(theme=0x01010000, label=0x01010001, icon=0x01010002, name=0x01010003, exported=0x01010010,
         configChanges=0x0101001f, minSdkVersion=0x0101020c, versionCode=0x0101021b, versionName=0x0101021c,
         windowSoftInputMode=0x0101022b, targetSdkVersion=0x01010270, maxSdkVersion=0x01010271,
         hardwareAccelerated=0x010102d3, launchMode=0x0101001d, scheme=0x01010027,
         host=0x01010028, pathPrefix=0x0101002b)
NS = 'http://schemas.android.com/apk/res/android'
T_REF, T_STR, T_DEC, T_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12


def pad4(b):
    return b + b'\0' * (-len(b) % 4)


def string_pool(strings):
    """String pool chunk (UTF-16)."""
    offs, data = [], b''
    for s in strings:
        offs.append(len(data))
        u = s.encode('utf-16-le')
        data += struct.pack('<H', len(u) // 2) + u + b'\0\0'
    data = pad4(data)
    hdr = 28
    start = hdr + 4 * len(strings)
    body = b''.join(struct.pack('<I', o) for o in offs) + data
    return struct.pack('<HHIIIIII', 0x0001, hdr, hdr + len(body), len(strings), 0, 0, start, 0) + body


# ---------- AndroidManifest.xml (binary XML) ----------
def manifest(vcode, vname):
    # (tag, [(attrName, type, value)], children)
    E = lambda tag, attrs, kids=(): (tag, attrs, list(kids))
    tree = E('manifest', [('versionCode', T_DEC, vcode), ('versionName', T_STR, vname), ('package', T_STR, PKG)], [
        E('uses-sdk', [('minSdkVersion', T_DEC, 24), ('targetSdkVersion', T_DEC, 34)]),
        E('uses-permission', [('name', T_STR, 'android.permission.INTERNET')]),
        E('uses-permission', [('name', T_STR, 'android.permission.ACCESS_NETWORK_STATE')]),
        E('uses-permission', [('name', T_STR, 'android.permission.REQUEST_INSTALL_PACKAGES')]),
        E('uses-permission', [('name', T_STR, 'android.permission.WRITE_EXTERNAL_STORAGE'), ('maxSdkVersion', T_DEC, 28)]),
        E('application', [('label', T_STR, LABEL), ('icon', T_REF, ICON_ID), ('hardwareAccelerated', T_BOOL, True),
                          ('theme', T_REF, THEME_ID)], [
            E('activity', [('name', T_STR, PKG + '.MainActivity'), ('exported', T_BOOL, True),
                           ('configChanges', T_HEX, 0x0FB0), ('windowSoftInputMode', T_HEX, 0x10), ('launchMode', T_DEC, 2)], [
                E('intent-filter', [], [
                    E('action', [('name', T_STR, 'android.intent.action.MAIN')]),
                    E('category', [('name', T_STR, 'android.intent.category.LAUNCHER')]),
                ]),
                # رابط تسجيل الدخول المرسل بالبريد من claude.ai يفتح داخل التطبيق
                E('intent-filter', [], [
                    E('action', [('name', T_STR, 'android.intent.action.VIEW')]),
                    E('category', [('name', T_STR, 'android.intent.category.DEFAULT')]),
                    E('category', [('name', T_STR, 'android.intent.category.BROWSABLE')]),
                    E('data', [('scheme', T_STR, 'https'), ('host', T_STR, 'claude.ai'), ('pathPrefix', T_STR, '/magic-link')]),
                    E('data', [('scheme', T_STR, 'https'), ('host', T_STR, 'claude.ai'), ('pathPrefix', T_STR, '/artifact/')]),
                ])
            ])
        ])
    ])
    # attribute names that have resource ids come first in the pool (sorted by id), matching the resource map
    used = set()

    def walk(n):
        for a in n[1]:
            if a[0] in A: used.add(a[0])
        for k in n[2]: walk(k)
    walk(tree)
    attr_names = sorted(used, key=lambda x: A[x])
    strings = list(attr_names)
    idx = {}

    def S(s):
        if s not in idx:
            if s in strings: idx[s] = strings.index(s)
            else: strings.append(s); idx[s] = len(strings) - 1
        return idx[s]
    for n in attr_names: S(n)
    S('android'); S(NS)

    def collect(n):
        S(n[0])
        for a in n[1]:
            S(a[0])
            if a[1] == T_STR: S(a[2])
        for k in n[2]: collect(k)
    collect(tree)

    nodes = b''

    def elem(n):
        nonlocal nodes
        tag, attrs, kids = n
        attrs = sorted(attrs, key=lambda a: A.get(a[0], 0x7fffffff))
        ab = b''
        for name, t, v in attrs:
            ns = S(NS) if name in A else 0xffffffff
            raw = S(v) if t == T_STR else 0xffffffff
            data = S(v) if t == T_STR else (0xffffffff if v is True else 0 if v is False else v)
            ab += struct.pack('<IIIHBBI', ns, S(name), raw, 8, 0, t, data)
        ext = struct.pack('<IIHHHHHH', 0xffffffff, S(tag), 20, 20, len(attrs), 0, 0, 0)
        body = ext + ab
        nodes += struct.pack('<HHIII', 0x0102, 16, 16 + len(body), 1, 0xffffffff) + body
        for k in kids: elem(k)
        nodes += struct.pack('<HHIIIII', 0x0103, 16, 24, 1, 0xffffffff, 0xffffffff, S(tag))
    ns_start = struct.pack('<HHIIIII', 0x0100, 16, 24, 1, 0xffffffff, S('android'), S(NS))
    elem(tree)
    ns_end = struct.pack('<HHIIIII', 0x0101, 16, 24, 1, 0xffffffff, S('android'), S(NS))
    pool = string_pool(strings)
    rmap = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(attr_names)) + b''.join(struct.pack('<I', A[n]) for n in attr_names)
    body = pool + rmap + ns_start + nodes + ns_end
    return struct.pack('<HHI', 0x0003, 8, 8 + len(body)) + body


# ---------- resources.arsc: أيقونة متكيفة (أندرويد 8+) + أيقونة عادية للأقدم ----------
# mipmap/ic_launcher (0x7f010000): xxxhdpi → PNG كامل، anydpi-v26 → XML adaptive-icon
# mipmap/ic_fg (0x7f010001) و mipmap/ic_bg (0x7f010002): طبقتا الأيقونة المتكيفة
ICON_PATH = 'res/mipmap-xxxhdpi-v4/ic_launcher.png'
FG_PATH = 'res/mipmap-xxxhdpi-v4/ic_fg.png'
BG_PATH = 'res/mipmap-xxxhdpi-v4/ic_bg.png'
ADAPT_PATH = 'res/mipmap-anydpi-v26/ic_launcher.xml'
NO_ENTRY = 0xffffffff


def _config(density, sdk):
    c = bytearray(64)
    struct.pack_into('<I', c, 0, 64)
    struct.pack_into('<H', c, 14, density)
    struct.pack_into('<H', c, 24, sdk)
    return bytes(c)


def arsc():
    gpool = string_pool([ICON_PATH, FG_PATH, BG_PATH, ADAPT_PATH])
    tpool = string_pool(['mipmap'])
    kpool = string_pool(['ic_launcher', 'ic_fg', 'ic_bg'])
    spec = struct.pack('<HHIBBHI', 0x0202, 16, 16 + 12, 1, 0, 0, 3) + struct.pack('<III', 0x0100 | 0x0400, 0x0100, 0x0100)

    def typ(config, vals):  # vals: [(key, string)] أو None لكل مدخل
        n = len(vals); thdr = 20 + 64; offs = []; ents = b''
        for v in vals:
            if v is None: offs.append(NO_ENTRY); continue
            offs.append(len(ents)); ents += struct.pack('<HHI', 8, 0, v[0]) + struct.pack('<HBBI', 8, 0, T_STR, v[1])
        body = b''.join(struct.pack('<I', o) for o in offs) + ents
        return struct.pack('<HHIBBHII', 0x0201, thdr, thdr + len(body), 1, 0, 0, n, thdr + 4 * n) + config + body
    t1 = typ(_config(640, 4), [(0, 0), (1, 1), (2, 2)])
    t2 = typ(_config(0xfffe, 26), [(0, 3), None, None])
    name = PKG.encode('utf-16-le').ljust(256, b'\0')
    phdr = 288
    pkg_body = tpool + kpool + spec + t1 + t2
    pkg = struct.pack('<HHII', 0x0200, phdr, phdr + len(pkg_body), 0x7f) + name + \
        struct.pack('<IIIII', phdr, 1, phdr + len(tpool), 3, 0) + pkg_body
    body = gpool + pkg
    return struct.pack('<HHII', 0x0002, 12, 12 + len(body), 1) + body


def adaptive_xml():
    """<adaptive-icon><background drawable=@mipmap/ic_bg/><foreground drawable=@mipmap/ic_fg/></adaptive-icon>"""
    DRAW = 0x01010199
    strings = ['drawable', 'android', NS, 'adaptive-icon', 'background', 'foreground']
    S = strings.index
    def start(tag, attrs):
        ab = b''.join(struct.pack('<IIIHBBI', S(NS), S('drawable'), 0xffffffff, 8, 0, T_REF, ref) for ref in attrs)
        ext = struct.pack('<IIHHHHHH', 0xffffffff, S(tag), 20, 20, len(attrs), 0, 0, 0)
        return struct.pack('<HHIII', 0x0102, 16, 16 + len(ext) + len(ab), 1, 0xffffffff) + ext + ab
    end = lambda tag: struct.pack('<HHIIIII', 0x0103, 16, 24, 1, 0xffffffff, 0xffffffff, S(tag))
    nodes = start('adaptive-icon', []) + start('background', [0x7f010002]) + end('background') + \
        start('foreground', [0x7f010001]) + end('foreground') + end('adaptive-icon')
    ns_s = struct.pack('<HHIIIII', 0x0100, 16, 24, 1, 0xffffffff, S('android'), S(NS))
    ns_e = struct.pack('<HHIIIII', 0x0101, 16, 24, 1, 0xffffffff, S('android'), S(NS))
    rmap = struct.pack('<HHII', 0x0180, 8, 12, DRAW)
    body = string_pool(strings) + rmap + ns_s + nodes + ns_e
    return struct.pack('<HHI', 0x0003, 8, 8 + len(body)) + body


def logo_png(name, size=None):
    import os
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo', name)
    im = Image.open(p)
    if size: im = im.resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return b.getvalue()


# ---------- icon ----------
def icon(size=192):
    import os
    logo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo', 'icon-1024.png')
    if os.path.exists(logo):  # شعار Sawah ERP (يُرسم بـ mklogo.py)
        b = io.BytesIO(); Image.open(logo).resize((size, size), Image.LANCZOS).save(b, 'PNG', optimize=True); return b.getvalue()
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=(28, 81, 174, 255))
    # ledger sheet
    m = s * 0.22
    d.rounded_rectangle([m, m * 0.95, s - m, s - m * 0.85], radius=s * 0.05, fill=(255, 255, 255, 255))
    for i in range(4):
        y = m * 1.55 + i * s * 0.115
        d.rounded_rectangle([m * 1.35, y, s - m * 1.35, y + s * 0.035], radius=s * 0.015, fill=(28, 81, 174, 70 if i else 255))
    # bar chart
    bx = m * 1.35
    for i, h in enumerate([0.10, 0.17, 0.24]):
        x = bx + i * s * 0.11
        d.rounded_rectangle([x, s - m * 1.2 - s * h, x + s * 0.07, s - m * 1.2], radius=s * 0.012, fill=(16, 185, 129, 255))
    im = im.resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return b.getvalue()


def write_apk(dex_path, out, vcode, vname):
    files = [('AndroidManifest.xml', manifest(vcode, vname), zipfile.ZIP_DEFLATED),
             ('classes.dex', open(dex_path, 'rb').read(), zipfile.ZIP_DEFLATED),
             ('resources.arsc', arsc(), zipfile.ZIP_STORED),
             (ICON_PATH, logo_png('ic-legacy.png', 192), zipfile.ZIP_STORED),
             (FG_PATH, logo_png('ic-fg.png'), zipfile.ZIP_STORED),
             (BG_PATH, logo_png('ic-bg.png'), zipfile.ZIP_STORED),
             (ADAPT_PATH, adaptive_xml(), zipfile.ZIP_DEFLATED)]
    with zipfile.ZipFile(out, 'w') as z:
        for name, data, method in files:
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = method
            if method == zipfile.ZIP_STORED:  # محاذاة 4 بايت (مطلوبة لـ resources.arsc في أندرويد 11+)
                off = z.fp.tell() + 30 + len(name.encode())
                padn = (-(off + 4)) % 4
                zi.extra = struct.pack('<HH', 0xD935, padn) + b'\0' * padn
            z.writestr(zi, data)


if __name__ == '__main__':
    dex, out = sys.argv[1], sys.argv[2]
    vcode = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    vname = sys.argv[4] if len(sys.argv) > 4 else '1.0'
    write_apk(dex, out, vcode, vname)
    print('wrote', out)

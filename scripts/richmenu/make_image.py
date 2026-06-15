#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LINE受付ハブ リッチメニュー画像生成 v3 (2500x1686 / 2行3列 / 6セル)

世界観の仕上げ(写真背景版):
- 全体背景に支笏湖の写真(サイトのヒーローと同じ)+ 濃紺グラデの薄オーバーレイ
- ボタンは「すりガラス(フロスト)」風の半透明カード → 湖が透けつつ文字は読みやすい
- 見出しは明朝(Shippori Mincho Bold)・濃紺、英ラベルは暖色オレンジ、アイコンはカラー絵文字
出力: richmenu.png
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 2500, 1686
COLS = [(0, 833), (833, 834), (1667, 833)]
ROWS = [(0, 843), (843, 843)]

HERE = os.path.dirname(os.path.abspath(__file__))
MINCHO = os.path.join(HERE, "fonts", "ShipporiMincho-Bold.ttf")
MINCHO_FALLBACK = "/usr/share/fonts/opentype/ipafont-mincho/ipam.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
BG_PHOTO = os.path.join(HERE, "assets", "bg_shikotsu.jpg")

INK = (0x18, 0x26, 0x3C)
ORANGE = (0xD9, 0x7A, 0x2E)
SUB_COL = (0x4A, 0x4F, 0x57)

CELLS = [
    ("🌱", "NEW PAGE", "無料仮ページ", "まずはここから"),
    ("✏️", "EDIT",     "ページ変更",   "内容の修正依頼"),
    ("🎉", "EVENT",    "イベント掲載", "チラシ・告知"),
    ("💳", "PAYMENT",  "お支払い",     "決済のご相談"),
    ("💬", "CONTACT",  "その他",       "お問い合わせ"),
    ("🌲", "WEBSITE",  "公式サイト",   "Link Hokkaido"),
]


def mincho(sz):
    path = MINCHO if os.path.exists(MINCHO) else MINCHO_FALLBACK
    return ImageFont.truetype(path, sz)


def emoji_img(ch, target):
    for strike in (109, 136, 128):
        try:
            f = ImageFont.truetype(EMOJI, strike)
        except OSError:
            continue
        canvas = Image.new("RGBA", (strike * 2, strike * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(canvas)
        try:
            d.text((strike // 2, strike // 4), ch, font=f, embedded_color=True)
        except Exception:
            continue
        bbox = canvas.getbbox()
        if not bbox:
            continue
        glyph = canvas.crop(bbox)
        scale = target / max(glyph.size)
        nw, nh = max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))
        return glyph.resize((nw, nh), Image.LANCZOS)
    return None


def cover(img, w, h):
    """cover-fit(短辺基準で拡大→中央クロップ)."""
    s = max(w / img.width, h / img.height)
    nw, nh = round(img.width * s), round(img.height * s)
    img = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - w) // 2
    y = (nh - h) // 2
    return img.crop((x, y, x + w, y + h))


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=r, fill=255)
    return m


def main():
    # --- 背景写真 + 濃紺グラデ オーバーレイ ---
    photo = Image.open(BG_PHOTO).convert("RGB")
    bg = cover(photo, W, H)
    # ほんのり彩度/明度を整えるための薄いぼかしは不要(クロップのみ)。
    # 濃紺の縦グラデ(上=薄 / 下=濃)で全体を引き締め、白カードを際立たせる
    ov = Image.new("L", (1, H))
    for y in range(H):
        t = y / H
        ov.putpixel((0, y), int(70 + 70 * t))      # alpha 70→140
    ov = ov.resize((W, H))
    navy = Image.new("RGB", (W, H), (16, 28, 46))
    bg = Image.composite(navy, bg, ov)

    radius = 40
    pad = 64  # 余白を広めに → 隙間から湖が見える

    cards = []
    for ry, rh in ROWS:
        for cx, cw in COLS:
            cards.append([cx + pad, ry + pad, cx + cw - pad, ry + rh - pad])

    # --- カードの影 ---
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for x0, y0, x1, y1 in cards:
        sd.rounded_rectangle([x0, y0 + 18, x1, y1 + 18], radius=radius, fill=(10, 18, 30, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow).convert("RGB")

    # --- フロスト(すりガラス)カード ---
    for x0, y0, x1, y1 in cards:
        region = bg.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(26))
        white = Image.new("RGB", region.size, (255, 255, 255))
        frost = Image.blend(region, white, 0.72)  # 72%白 → 透け感を残しつつ可読
        bg.paste(frost, (x0, y0), rounded_mask(region.size, radius))

    base = bg.convert("RGBA")
    d = ImageDraw.Draw(base)
    # カード枠(白の細線)
    for x0, y0, x1, y1 in cards:
        d.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=(255, 255, 255, 200), width=3)

    f_title = mincho(92)
    f_sub = mincho(40)
    f_en = ImageFont.truetype(SANS, 34)

    def center(text, font, cx, cy, fill, tracking=0):
        if tracking:
            widths = [d.textlength(c, font=font) for c in text]
            total = sum(widths) + tracking * (len(text) - 1)
            x = cx - total / 2
            asc, desc = font.getmetrics()
            y = cy - (asc + desc) / 2
            for c, w in zip(text, widths):
                d.text((x, y), c, font=font, fill=fill)
                x += w + tracking
        else:
            l, t, r, b = d.textbbox((0, 0), text, font=font)
            d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=font, fill=fill)

    for (x0, y0, x1, y1), (ch, en, title, sub) in zip(cards, CELLS):
        cw, chh = x1 - x0, y1 - y0
        ccx = x0 + cw / 2
        ic = emoji_img(ch, 144)
        if ic is not None:
            base.paste(ic, (int(ccx - ic.width / 2), int(y0 + chh * 0.21 - ic.height / 2)), ic)
        center(en, f_en, ccx, y0 + chh * 0.44, ORANGE, tracking=10)
        ul = 54
        d.rounded_rectangle([ccx - ul, y0 + chh * 0.50, ccx + ul, y0 + chh * 0.50 + 6], radius=3, fill=ORANGE)
        center(title, f_title, ccx, y0 + chh * 0.64, INK)
        center(sub, f_sub, ccx, y0 + chh * 0.80, SUB_COL)

    out = os.path.join(HERE, "richmenu.jpg")
    base.convert("RGB").save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()

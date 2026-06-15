#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LINE受付ハブ リッチメニュー画像生成 v2 (2500x1686 / 2行3列 / 6セル)

ブランド世界観に合わせた仕上げ:
- 生成りクリームの背景 + 白い角丸カード(やわらかい影)
- 見出しは明朝(Shippori Mincho Bold)・濃紺
- 英字ミニラベルは暖色オレンジ(letter-spacing)
- アイコンは Noto Color Emoji(カラー絵文字)
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

# ブランドカラー
CREAM = (0xF7, 0xF3, 0xEC)
INK = (0x18, 0x26, 0x3C)   # 濃紺
ORANGE = (0xD9, 0x7A, 0x2E)  # 暖色
SUB_COL = (0x6B, 0x6F, 0x76)
CARD_BG = (0xFF, 0xFF, 0xFF)
CARD_LINE = (0xE5, 0xDE, 0xD2)

# 各セル: (絵文字, 英ラベル, 見出し, 補足)
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
    """Noto Color Emoji を target px のRGBAで返す(native strikeから縮小)."""
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


def rounded(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)


def main():
    base = Image.new("RGB", (W, H), CREAM).convert("RGBA")

    pad = 46          # セル内側余白
    radius = 40

    # --- やわらかい影レイヤー ---
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    cards = []
    for ry, rh in ROWS:
        for cx, cw in COLS:
            box = [cx + pad, ry + pad, cx + cw - pad, ry + rh - pad]
            cards.append(box)
            sd.rounded_rectangle([box[0], box[1] + 16, box[2], box[3] + 16],
                                 radius=radius, fill=(24, 38, 60, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    base = Image.alpha_composite(base, shadow)

    d = ImageDraw.Draw(base)
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

    for box, (ch, en, title, sub) in zip(cards, CELLS):
        x0, y0, x1, y1 = box
        cw, chh = x1 - x0, y1 - y0
        ccx = x0 + cw / 2
        # カード
        d.rounded_rectangle(box, radius=radius, fill=CARD_BG, outline=CARD_LINE, width=3)
        # アイコン(絵文字)
        ic = emoji_img(ch, 150)
        if ic is not None:
            base.paste(ic, (int(ccx - ic.width / 2), int(y0 + chh * 0.20 - ic.height / 2)), ic)
        # 英ラベル(オレンジ・字間広め)
        center(en, f_en, ccx, y0 + chh * 0.44, ORANGE, tracking=10)
        # オレンジの短い下線
        ul = 54
        d.rounded_rectangle([ccx - ul, y0 + chh * 0.50, ccx + ul, y0 + chh * 0.50 + 6],
                            radius=3, fill=ORANGE)
        # 見出し(明朝・濃紺)
        center(title, f_title, ccx, y0 + chh * 0.64, INK)
        # 補足
        center(sub, f_sub, ccx, y0 + chh * 0.80, SUB_COL)

    out = os.path.join(HERE, "richmenu.png")
    base.convert("RGB").save(out, "PNG", optimize=True)
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LINE受付ハブ リッチメニュー画像生成 (2500x1686 / 2行3列 / 6セル)
IPAGothic を使って日本語ラベルを描画。出力: richmenu.png
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
# 列: 833 / 834 / 833  行: 843 / 843
COLS = [(0, 833), (833, 834), (1667, 833)]
ROWS = [(0, 843), (843, 843)]

FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

# 各セル: (見出し, 補足, アクセント色)
CELLS = [
    ("無料仮ページ",  "まずはここから", (0x2E, 0x7D, 0x32)),  # 緑
    ("ページ変更",    "内容の修正依頼", (0x15, 0x65, 0xC0)),  # 青
    ("イベント掲載",  "チラシ・告知",   (0xE6, 0x51, 0x00)),  # 橙
    ("お支払い",      "決済の相談",     (0x6A, 0x1B, 0x9A)),  # 紫
    ("その他",        "お問い合わせ",   (0x00, 0x83, 0x8F)),  # 青緑
    ("公式サイト",    "Link Hokkaido", (0x37, 0x47, 0x4F)),  # 紺灰
]

BG = (0xFA, 0xFA, 0xFA)
LINE_COL = (0xE0, 0xE0, 0xE0)
TITLE_COL = (0x21, 0x21, 0x21)
SUB_COL = (0x75, 0x75, 0x75)


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_PATH, 96)
    f_sub = ImageFont.truetype(FONT_PATH, 46)

    def center_text(text, font, cx, cy, fill):
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=font, fill=fill)

    i = 0
    for (ry, rh) in ROWS:
        for (cx, cw) in COLS:
            title, sub, accent = CELLS[i]
            x0, y0 = cx, ry
            x1, y1 = cx + cw, ry + rh
            # アクセント帯(上部)
            d.rectangle([x0, y0, x1, y0 + 14], fill=accent)
            # アクセント丸(アイコン代わり)
            r = 46
            ccx, ccy = x0 + cw / 2, y0 + rh * 0.30
            d.ellipse([ccx - r, ccy - r, ccx + r, ccy + r], fill=accent)
            # 見出し・補足
            center_text(title, f_title, x0 + cw / 2, y0 + rh * 0.58, TITLE_COL)
            center_text(sub, f_sub, x0 + cw / 2, y0 + rh * 0.74, SUB_COL)
            i += 1

    # グリッド線
    for (cx, cw) in COLS[1:]:
        d.line([(cx, 0), (cx, H)], fill=LINE_COL, width=4)
    d.line([(0, ROWS[1][0]), (W, ROWS[1][0])], fill=LINE_COL, width=4)

    out = "richmenu.png"
    img.save(out, "PNG", optimize=True)
    import os
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()

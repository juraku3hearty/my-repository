#!/usr/bin/env python3
"""Vimeoから音声/動画ファイルを取得する（字幕が無い動画をWhisperに回す場合のみ）。

  python3 scripts/fetch_audio.py 900000001

注意: この取得には Vimeo の Pro 以上のプランと、トークンの video_files スコープが必要。
権限が無い場合は取得できないので、元の動画ファイルを講座側から直接受け取る必要がある。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests  # noqa: E402

import config  # noqa: E402
from vimeo_client import VimeoClient  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    video_id = sys.argv[1]
    client = VimeoClient()

    options = client.download_options(video_id)
    if not options:
        print("ダウンロード可能なファイルがありません。")
        print("考えられる原因:")
        print("  - Vimeoのプランが Pro 未満（ダウンロードAPIが使えない）")
        print("  - トークンに video_files スコープが無い")
        print("  - 動画側でダウンロードが無効になっている")
        print("→ 講座の元動画ファイルを直接受け取り、data/audio/ に 動画ID.m4a で置いてください。")
        return 2

    # 文字起こし目的なので、一番軽いものを選ぶ
    options.sort(key=lambda o: o.get("size") or 0)
    choice = options[0]
    size_mb = (choice.get("size") or 0) / 1024 / 1024
    print(f"取得: quality={choice.get('quality')} type={choice.get('type')} {size_mb:.1f}MB")

    config.AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    suffix = ".mp4" if "mp4" in (choice.get("type") or "") else ".bin"
    out_path = config.AUDIO_DIR / f"{video_id}{suffix}"

    with requests.get(choice["link"], stream=True, timeout=600) as res:
        res.raise_for_status()
        with out_path.open("wb") as f:
            for block in res.iter_content(chunk_size=1 << 20):
                f.write(block)
    print(f"保存: {out_path}")
    print(f"次に: python3 scripts/transcribe_whisper.py {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""字幕が無い動画の受け皿。音声ファイルをWhisperでVTT化する。

  python3 scripts/transcribe_whisper.py data/audio/900000001.m4a
  python3 scripts/transcribe_whisper.py data/audio/           # まとめて

出力は data/captions_manual/{動画ID}.vtt。そのあと `python3 cli.py import-manual`。
ファイル名の先頭を動画IDにしておくこと（例 900000001.m4a / 900000001_第1回.m4a）。

前提: pip install faster-whisper  （VPSで回すなら ffmpeg も必要）
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402

AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".mp4", ".mov", ".aac", ".flac"}


def to_vtt_timestamp(seconds: float) -> str:
    total = max(0.0, float(seconds))
    h = int(total // 3600)
    m = int(total % 3600 // 60)
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def transcribe(path: Path, model_size: str = "large-v3") -> Path:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("faster-whisper が未インストールです: pip install faster-whisper")

    video_id = path.stem.split("_")[0]
    print(f"文字起こし中: {path.name} → 動画ID {video_id}（モデル {model_size}）")

    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, info = model.transcribe(str(path), language="ja", vad_filter=True)
    print(f"  検出言語: {info.language} / 長さ {info.duration:.0f}秒")

    lines = ["WEBVTT", ""]
    count = 0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        count += 1
        lines.append(str(count))
        lines.append(f"{to_vtt_timestamp(seg.start)} --> {to_vtt_timestamp(seg.end)}")
        lines.append(text)
        lines.append("")

    config.MANUAL_CAPTION_DIR.mkdir(parents=True, exist_ok=True)
    out_path = config.MANUAL_CAPTION_DIR / f"{video_id}.vtt"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  出力: {out_path}（{count}キュー）")
    return out_path


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    target = Path(sys.argv[1])
    model_size = sys.argv[2] if len(sys.argv) > 2 else "large-v3"

    targets = (
        sorted(p for p in target.iterdir() if p.suffix.lower() in AUDIO_SUFFIXES)
        if target.is_dir() else [target]
    )
    if not targets:
        print(f"音声ファイルが見つかりません: {target}")
        return 1
    for path in targets:
        transcribe(path, model_size)
    print("\n完了。次に: python3 cli.py import-manual")
    return 0


if __name__ == "__main__":
    sys.exit(main())

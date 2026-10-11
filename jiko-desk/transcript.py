"""字幕（VTT/SRT）の解析と、Geminiに渡すためのチャンク分割。

AIが「元動画の該当時刻」を書けるように、本文は必ず [HH:MM:SS] 付きの行にして渡す。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import config

TIME_RE = re.compile(
    r"(?P<h>\d{1,3}):(?P<m>\d{2}):(?P<s>\d{2})(?:[.,](?P<ms>\d{1,3}))?"
    r"\s*-->\s*"
    r"(?P<h2>\d{1,3}):(?P<m2>\d{2}):(?P<s2>\d{2})(?:[.,](?P<ms2>\d{1,3}))?"
)
# MM:SS 形式（時が省略された字幕）にも対応する
SHORT_TIME_RE = re.compile(
    r"^(?P<m>\d{1,3}):(?P<s>\d{2})(?:[.,](?P<ms>\d{1,3}))?\s*-->\s*"
    r"(?P<m2>\d{1,3}):(?P<s2>\d{2})(?:[.,](?P<ms2>\d{1,3}))?"
)
TAG_RE = re.compile(r"</?[^>]+>")


@dataclass
class Cue:
    start: float
    end: float
    text: str


def hms(seconds: float) -> str:
    total = max(0, int(seconds or 0))
    return f"{total // 3600:02d}:{total % 3600 // 60:02d}:{total % 60:02d}"


def to_seconds(value: str | float | int | None) -> float:
    """'HH:MM:SS(.mmm)' / 'MM:SS' / 数値 を秒に変換する。"""
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    m = re.match(r"^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$", text)
    if m:
        h = int(m.group(1) or 0)
        return h * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + int(m.group(4) or 0) / 1000
    try:
        return float(text)
    except ValueError:
        return 0.0


def _match_timing(line: str):
    """タイミング行なら (開始秒, 終了秒) を返す。"""
    m = TIME_RE.search(line)
    if m:
        g = m.groupdict()
        start = int(g["h"]) * 3600 + int(g["m"]) * 60 + int(g["s"]) + int(g.get("ms") or 0) / 1000
        end = int(g["h2"]) * 3600 + int(g["m2"]) * 60 + int(g["s2"]) + int(g.get("ms2") or 0) / 1000
        return start, end
    m = SHORT_TIME_RE.match(line.strip())
    if m:
        g = m.groupdict()
        start = int(g["m"]) * 60 + int(g["s"]) + int(g.get("ms") or 0) / 1000
        end = int(g["m2"]) * 60 + int(g["s2"]) + int(g.get("ms2") or 0) / 1000
        return start, end
    return None


def parse_cues(raw: str) -> list[Cue]:
    """WebVTT / SRT を行単位で走査して解析する。

    空行の入れ方が崩れている字幕ファイル（キュー番号と本文が連続している等）でも
    取りこぼさないように、ブロック分割ではなくタイミング行を起点に切る。
    """
    text = raw.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    cues: list[Cue] = []
    cur: tuple[float, float] | None = None
    buf: list[str] = []
    skip_block = False

    def flush() -> None:
        nonlocal cur, buf
        if cur is not None:
            # 末尾に残ったキュー番号（数字だけの行）は本文ではないので捨てる
            while buf and re.fullmatch(r"\d{1,5}", buf[-1].strip()):
                buf.pop()
            body = TAG_RE.sub("", " ".join(buf))
            body = re.sub(r"\s+", " ", body).strip()
            if body:
                cues.append(Cue(start=cur[0], end=cur[1], text=body))
        cur, buf = None, []

    for line in text.split("\n"):
        stripped = line.strip()
        timing = _match_timing(line)
        if timing:
            flush()
            cur = timing
            skip_block = False
            continue
        if stripped == "":
            flush()
            skip_block = False
            continue
        if stripped.upper().startswith("WEBVTT") or stripped.startswith("NOTE") or stripped.startswith("STYLE"):
            skip_block = True
            continue
        if skip_block or cur is None:
            continue
        buf.append(stripped)

    flush()
    cues.sort(key=lambda c: c.start)
    return cues


def merge_cues(cues: list[Cue], gap_sec: float = 1.2) -> list[Cue]:
    """細切れの字幕を文としてつなぐ（1キュー数文字の自動字幕対策）。"""
    merged: list[Cue] = []
    for cue in cues:
        if (
            merged
            and cue.start - merged[-1].end <= gap_sec
            and len(merged[-1].text) < 120
            and not re.search(r"[。！？]$", merged[-1].text)
        ):
            prev = merged[-1]
            merged[-1] = Cue(start=prev.start, end=cue.end, text=(prev.text + cue.text).strip())
        else:
            merged.append(cue)
    return merged


def to_timed_text(cues: list[Cue]) -> str:
    """保存・AI投入用の時刻付きテキスト。"""
    return "\n".join(f"[{hms(c.start)}] {c.text}" for c in cues)


@dataclass
class Chunk:
    index: int
    start: float
    end: float
    text: str


def chunk_cues(cues: list[Cue],
               char_limit: int | None = None,
               overlap: int | None = None) -> list[Chunk]:
    """話題が切れないよう数キュー重ねながら、文字数上限でチャンクに割る。"""
    char_limit = char_limit or config.CHUNK_CHAR_LIMIT
    overlap = config.CHUNK_OVERLAP_CUES if overlap is None else overlap
    if not cues:
        return []

    chunks: list[Chunk] = []
    buf: list[Cue] = []
    size = 0
    for cue in cues:
        line_len = len(cue.text) + 12  # 時刻表記ぶん
        if buf and size + line_len > char_limit:
            chunks.append(_as_chunk(len(chunks), buf))
            carry = buf[-overlap:] if overlap else []
            if sum(len(c.text) + 12 for c in carry) > char_limit // 2:
                carry = []  # 重ねだけで上限を食う場合は重ねない
            buf = carry
            size = sum(len(c.text) + 12 for c in buf)
        buf.append(cue)
        size += line_len
    if buf:
        chunks.append(_as_chunk(len(chunks), buf))
    return chunks


def _as_chunk(index: int, cues: list[Cue]) -> Chunk:
    return Chunk(index=index, start=cues[0].start, end=cues[-1].end, text=to_timed_text(cues))


def load_cues_from_text(raw: str) -> list[Cue]:
    """字幕ファイルの文字列からキューを作る（細切れは結合する）。"""
    return merge_cues(parse_cues(raw))

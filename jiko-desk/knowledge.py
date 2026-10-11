"""パイプライン本体。

  ① 動画一覧        sync_video_list
  ② 字幕取得        fetch_captions / import_manual_captions
  ③ ナレッジ生成    build_knowledge
  ④ 要確認の振り分け classify_expert（AIの申告とキーワード辞書の二重判定）
"""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import config
import db
import gemini
import transcript as tr
from vimeo_client import VimeoClient, VimeoError

PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "knowledge_prompt.md"


# ---------------- ① 動画一覧 ----------------

def sync_video_list(conn: sqlite3.Connection, client: VimeoClient) -> tuple[int, int]:
    """Vimeoから動画一覧を取り込む。戻り値は (新規, 総数)。"""
    videos = client.list_videos()
    new_count = 0
    for video in videos:
        if db.upsert_video(conn, video.as_dict()):
            new_count += 1
    return new_count, len(videos)


# ---------------- ② 字幕取得 ----------------

def fetch_captions(conn: sqlite3.Connection, client: VimeoClient,
                   video_ids: list[str] | None = None,
                   only_missing: bool = True) -> dict:
    """Vimeoの字幕トラックを取得して文字起こしとして保存する。"""
    config.CAPTION_DIR.mkdir(parents=True, exist_ok=True)
    targets = _targets(conn, video_ids)
    result = {"ok": 0, "no_caption": 0, "error": 0, "skipped": 0, "details": []}

    for video in targets:
        vid = video["video_id"]
        if only_missing and db.get_transcript(conn, vid):
            result["skipped"] += 1
            continue
        try:
            tracks = client.list_text_tracks(vid)
            track = client.pick_track(tracks)
            if not track:
                db.set_video_fields(conn, vid,
                                    caption_state=config.CaptionState.NONE,
                                    status=config.VideoStatus.NO_CAPTION,
                                    note="Vimeoに字幕トラックなし。手動/Whisperでの文字起こしが必要")
                result["no_caption"] += 1
                result["details"].append((vid, video["title"], "字幕なし"))
                continue

            raw = client.download_track(track)
            cues = tr.load_cues_from_text(raw)
            if not cues:
                raise VimeoError("字幕を解析できませんでした（中身が空か形式不明）")

            suffix = ".vtt" if "WEBVTT" in raw[:200].upper() else ".srt"
            (config.CAPTION_DIR / f"{vid}{suffix}").write_text(raw, encoding="utf-8")

            db.save_transcript(conn, vid, source=config.CaptionState.VIMEO,
                               language=track.get("language") or "",
                               body=tr.to_timed_text(cues), cue_count=len(cues))
            db.set_video_fields(conn, vid,
                                caption_state=config.CaptionState.VIMEO,
                                caption_language=track.get("language") or "",
                                transcript_fetched_at=db.now(),
                                status=config.VideoStatus.TRANSCRIBED, note="")
            result["ok"] += 1
            result["details"].append((vid, video["title"], f"{len(cues)}キュー"))
        except Exception as e:  # 1本の失敗で全体を止めない
            db.set_video_fields(conn, vid, status=config.VideoStatus.ERROR, note=str(e)[:500])
            result["error"] += 1
            result["details"].append((vid, video["title"], f"エラー: {e}"))
    return result


def import_manual_captions(conn: sqlite3.Connection) -> dict:
    """data/captions_manual/{動画ID}.vtt|.srt を取り込む。

    Vimeoに字幕が無い動画の受け皿。Whisperの出力もここに置く。
    """
    config.MANUAL_CAPTION_DIR.mkdir(parents=True, exist_ok=True)
    result = {"ok": 0, "unknown": 0, "error": 0, "details": []}
    for path in sorted(config.MANUAL_CAPTION_DIR.iterdir()):
        if path.suffix.lower() not in (".vtt", ".srt", ".txt"):
            continue
        vid = path.stem.split("_")[0]
        video = db.get_video(conn, vid)
        if not video:
            result["unknown"] += 1
            result["details"].append((path.name, "動画一覧に無いID"))
            continue
        try:
            raw = path.read_text(encoding="utf-8")
            cues = tr.load_cues_from_text(raw)
            if not cues:
                raise ValueError("時刻付き字幕として解析できません（VTT/SRT形式が必要）")
            db.save_transcript(conn, vid, source=config.CaptionState.MANUAL, language="ja",
                               body=tr.to_timed_text(cues), cue_count=len(cues))
            db.set_video_fields(conn, vid,
                                caption_state=config.CaptionState.MANUAL,
                                transcript_fetched_at=db.now(),
                                status=config.VideoStatus.TRANSCRIBED, note="")
            result["ok"] += 1
            result["details"].append((path.name, f"{len(cues)}キュー"))
        except Exception as e:
            result["error"] += 1
            result["details"].append((path.name, f"エラー: {e}"))
    return result


# ---------------- ③ ナレッジ生成 ----------------

def build_knowledge(conn: sqlite3.Connection,
                    video_ids: list[str] | None = None,
                    force: bool = False,
                    limit_chunks: int | None = None,
                    model: str | None = None,
                    verbose: bool = True) -> dict:
    """文字起こしを話題ごとに分割してQ&A+解説を生成し、SQLiteに保存する。"""
    prompt_template = PROMPT_PATH.read_text(encoding="utf-8")
    schema = gemini.item_schema()
    targets = _targets(conn, video_ids)
    result = {"videos": 0, "items": 0, "pending": 0, "skipped": 0, "error": 0, "details": []}

    for video in targets:
        vid = video["video_id"]
        row = db.get_transcript(conn, vid)
        if not row:
            result["skipped"] += 1
            continue
        if video["knowledge_built_at"] and not force:
            result["skipped"] += 1
            continue
        if force:
            db.delete_items_of_video(conn, vid)

        cues = [tr.Cue(start=tr.to_seconds(m.group(1)), end=0, text=m.group(2))
                for m in re.finditer(r"^\[(\d{2}:\d{2}:\d{2})\]\s*(.+)$", row["body"], re.MULTILINE)]
        for i, cue in enumerate(cues):  # 終了時刻は次のキューの開始で埋める
            cue.end = cues[i + 1].start if i + 1 < len(cues) else cue.start + 10

        chunks = tr.chunk_cues(cues)
        if limit_chunks:
            chunks = chunks[:limit_chunks]
        if not chunks:
            result["skipped"] += 1
            continue

        made = 0
        try:
            for chunk in chunks:
                prompt = (prompt_template
                          .replace("{categories}", "\n".join(f"- {c}" for c in config.CATEGORIES))
                          .replace("{expert_types}", "、".join(config.EXPERT_TYPES))
                          .replace("{video_title}", video["title"])
                          .replace("{video_url}", video["url"])
                          .replace("{chunk_range}", f"{tr.hms(chunk.start)} 〜 {tr.hms(chunk.end)}")
                          .replace("{transcript}", chunk.text))

                data = gemini.generate_json(prompt, schema, model=model)
                for raw_item in (data or {}).get("items", []):
                    item = normalize_item(raw_item, video, chunk)
                    if not item:
                        continue
                    if db.item_exists(conn, vid, item["question"], item["start_sec"]):
                        continue
                    item["video_id"] = vid
                    db.insert_item(conn, item)
                    made += 1
                    if item["review_status"] == config.ReviewStatus.PENDING:
                        result["pending"] += 1
                if verbose:
                    print(f"  [{video['title'][:28]}] チャンク{chunk.index + 1}/{len(chunks)} 済 (累計{made}項目)")
                gemini.throttle()

            db.set_video_fields(conn, vid, knowledge_built_at=db.now(),
                                item_count=made, status=config.VideoStatus.BUILT, note="")
            result["videos"] += 1
            result["items"] += made
            result["details"].append((vid, video["title"], f"{made}項目"))
        except Exception as e:
            db.set_video_fields(conn, vid, status=config.VideoStatus.ERROR, note=str(e)[:500])
            result["error"] += 1
            result["details"].append((vid, video["title"], f"エラー: {e}"))
    return result


# ---------------- ④ 要確認の振り分け ----------------

def classify_expert(text: str) -> tuple[bool, str, list[str]]:
    """法律・保険・医療に関わる判断を含むかを辞書で判定する（強/弱の2段階）。

    AIの needs_expert_review と OR で結合して使う。AIの申告漏れを辞書で拾う一方、
    単なる手順説明を巻き込まないよう、弱い語は文単位の共起でしか効かせない。
    """
    if not text:
        return False, "", []

    sentences = [s for s in re.split(r"[。\n]", text) if s.strip()]
    matched: list[str] = []
    scores: dict[str, int] = {}

    for expert_type, words in config.EXPERT_KEYWORDS.items():
        strong_hits = [w for w in words["strong"] if w in text]
        if strong_hits:
            matched.extend(strong_hits)
            scores[expert_type] = scores.get(expert_type, 0) + 3 * len(strong_hits)

        weak_all = [w for w in words["weak"] if w in text]
        if not weak_all:
            continue
        for sentence in sentences:
            weak_in_sentence = [w for w in words["weak"] if w in sentence]
            has_judgement = any(p in sentence for p in config.JUDGEMENT_PATTERNS)
            if len(weak_in_sentence) >= 2 or (weak_in_sentence and has_judgement):
                matched.extend(weak_in_sentence)
                scores[expert_type] = scores.get(expert_type, 0) + len(weak_in_sentence)
                break

    if not scores:
        return False, "", []
    primary = max(scores.items(), key=lambda kv: kv[1])[0]
    return True, primary, sorted(set(matched))


def detect_outdated(text: str) -> bool:
    return any(w in text for w in config.OUTDATED_KEYWORDS)


def normalize_item(raw: dict, video: sqlite3.Row, chunk: "tr.Chunk") -> dict | None:
    """AI出力を検証・補正する。ここを通らないものは保存しない。"""
    question = (raw.get("question") or "").strip()
    evidence = (raw.get("evidence_quote") or "").strip()
    answer = (raw.get("answer_short") or "").strip()
    body = (raw.get("body_md") or "").strip()
    if not question or not answer:
        return None
    if len(question) < 6 or len(answer) < 10:
        return None

    category = raw.get("category")
    if category not in config.CATEGORIES:
        category = "その他"

    duration = float(video["duration_sec"] or 0)
    start = tr.to_seconds(raw.get("start_time"))
    end = tr.to_seconds(raw.get("end_time"))
    # AIが時刻を外した場合はチャンクの範囲に収める
    if not (chunk.start - 30 <= start <= chunk.end + 30):
        start = chunk.start
    if end <= start:
        end = min(chunk.end, start + 180)
    if duration:
        start = max(0.0, min(start, duration))
        end = max(start, min(end, duration))

    keywords = [str(k).strip() for k in (raw.get("keywords") or []) if str(k).strip()]
    key_points = [str(k).strip() for k in (raw.get("key_points") or []) if str(k).strip()]
    unknown_points = [str(k).strip() for k in (raw.get("unknown_points") or []) if str(k).strip()]
    caveats = (raw.get("caveats") or "").strip()
    review_points = (raw.get("review_points") or "").strip()

    haystack = " ".join([question, answer, body, caveats, " ".join(key_points), " ".join(keywords)])
    kw_needs, kw_type, matched = classify_expert(haystack)
    ai_needs = bool(raw.get("needs_expert_review"))
    ai_type = raw.get("expert_type") if raw.get("expert_type") in config.EXPERT_TYPES else ""

    needs_review = ai_needs or kw_needs
    expert_type = (ai_type if ai_type and ai_type != "なし" else "") or kw_type
    if needs_review and not expert_type:
        expert_type = "弁護士"  # 区分不明なら最も影響の大きい側に寄せる

    if needs_review and not review_points:
        review_points = "講座内容の要約として正確か、現在の取り扱いとして妥当かの確認をお願いします。"
    if matched and needs_review:
        review_points += f"（判定語: {', '.join(matched[:8])}）"

    outdated = bool(raw.get("may_be_outdated")) or detect_outdated(haystack)
    if outdated:
        note = "制度・取り扱いが変わっている可能性があるため、現行の内容かの更新確認が必要です。"
        review_points = (review_points + " " + note).strip()

    return {
        "chunk_index": chunk.index,
        "category": category,
        "question": question,
        "answer_short": answer,
        "body_md": body or answer,
        "evidence": evidence,
        "key_points": key_points,
        "caveats": caveats,
        "unknown_points": unknown_points,
        "keywords": keywords,
        "start_sec": start,
        "end_sec": end,
        "review_status": config.ReviewStatus.PENDING if needs_review else config.ReviewStatus.NOT_REQUIRED,
        "expert_type": expert_type,
        "review_points": review_points.strip(),
        "matched_keywords": matched,
        "outdated": outdated,
    }


def _targets(conn: sqlite3.Connection, video_ids: list[str] | None) -> list[sqlite3.Row]:
    if video_ids:
        rows = [db.get_video(conn, vid) for vid in video_ids]
        return [r for r in rows if r]
    return db.list_videos(conn)

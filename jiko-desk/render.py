"""出力の生成。

  1. 解説PDF（本編）     … Q&A + 解説を読み物として組んだ冊子
  2. 確認待ち別冊PDF     … 専門家レビュー用（確認依頼事項と記入欄つき）
  3. Q&A索引 CSV / JSON  … 検索用。各Q&Aに解説PDFのページ番号を持たせる
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
from datetime import date
from pathlib import Path

import markdown as md
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import CSS, HTML

import config
import db
import quality
import transcript as tr

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
PUBLIC_STATUSES = (config.ReviewStatus.APPROVED, config.ReviewStatus.NOT_REQUIRED)
PENDING_STATUSES = (config.ReviewStatus.PENDING, config.ReviewStatus.REJECTED)


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _to_html(body_md: str) -> str:
    """解説本文をHTMLに。見出し記法は冊子の構造を壊すので落とす。"""
    text = re.sub(r"^#{1,6}\s*", "", body_md or "", flags=re.MULTILINE)
    return md.markdown(text, extensions=["nl2br"])


def _timed_url(url: str, start_sec: float) -> str:
    base = (url or "").split("#")[0]
    return f"{base}#t={int(start_sec or 0)}s" if base else ""


def collect_items(conn: sqlite3.Connection, statuses: tuple[str, ...],
                  only_publishable: bool = False) -> list[dict]:
    """カテゴリー順・動画順に項目を集め、Q番号と表示用の値を付ける。

    only_publishable=True なら、自動品質チェックで「要目視」になった項目を外す。
    """
    rows = db.list_items(conn, review_status=statuses)
    if only_publishable:
        rows = [row for row in rows if quality.publishable(row)]
    order = {c: i for i, c in enumerate(config.CATEGORIES)}
    rows = sorted(rows, key=lambda r: (order.get(r["category"], 99), r["video_id"], r["start_sec"] or 0))

    items: list[dict] = []
    for i, row in enumerate(rows, start=1):
        items.append({
            "id": row["id"],
            "q_no": i,
            "anchor": f"kb-{row['id']}",
            "category": row["category"] or "その他",
            "question": row["question"],
            "answer_short": row["answer_short"],
            "body_html": _to_html(row["body_md"]),
            "body_md": row["body_md"],
            "evidence": row["evidence"] or "",
            "quality_status": row["quality_status"] or "",
            "quality_notes": row["quality_notes"] or "",
            "key_points": db.loads(row["key_points"]),
            "caveats": row["caveats"] or "",
            "unknown_points": db.loads(row["unknown_points"]),
            "keywords": db.loads(row["keywords"]),
            "start_sec": row["start_sec"] or 0,
            "end_sec": row["end_sec"] or 0,
            "start_hms": tr.hms(row["start_sec"] or 0),
            "end_hms": tr.hms(row["end_sec"] or 0),
            "review_status": row["review_status"],
            "expert_type": row["expert_type"] or "",
            "review_points": row["review_points"] or "",
            "outdated": bool(row["outdated"]),
            "video_id": row["video_id"],
            "video_title": row["video_title"],
            "video_url": row["video_url"],
            "timed_url": _timed_url(row["video_url"], row["start_sec"] or 0),
        })
    return items


def _chapters(items: list[dict]) -> list[dict]:
    chapters: list[dict] = []
    for category in config.CATEGORIES:
        group = [i for i in items if i["category"] == category]
        if group:
            chapters.append({"category": category, "entries": group})
    return chapters


def _keyword_index(items: list[dict], min_len: int = 2) -> list[tuple[str, list[int]]]:
    index: dict[str, list[int]] = {}
    for item in items:
        for keyword in item["keywords"]:
            key = str(keyword).strip()
            if len(key) < min_len:
                continue
            index.setdefault(key, [])
            if item["q_no"] not in index[key]:
                index[key].append(item["q_no"])
    return sorted(index.items(), key=lambda kv: kv[0])


def _videos(conn: sqlite3.Connection, items: list[dict]) -> list[dict]:
    used = {i["video_id"] for i in items}
    videos = []
    for row in db.list_videos(conn):
        if row["video_id"] not in used:
            continue
        count = sum(1 for i in items if i["video_id"] == row["video_id"])
        videos.append({
            "title": row["title"],
            "url": row["url"],
            "published_at": row["published_at"] or "",
            "duration_hms": tr.hms(row["duration_sec"] or 0),
            "item_count": count,
        })
    return videos


def _render_pdf(context: dict, out_path: Path) -> dict[str, int]:
    """PDFを書き出し、各項目アンカーのページ番号を返す。"""
    html_text = _env().get_template("book.html.j2").render(**context)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    document = HTML(string=html_text, base_url=str(TEMPLATE_DIR)).render(
        stylesheets=[CSS(filename=str(TEMPLATE_DIR / "style.css"))]
    )
    pages: dict[str, int] = {}
    for page_no, page in enumerate(document.pages, start=1):
        for anchor in getattr(page, "anchors", {}) or {}:
            if anchor.startswith("kb-") and anchor not in pages:
                pages[anchor] = page_no
    document.write_pdf(str(out_path))
    return {anchor[3:]: page for anchor, page in pages.items()}


def render_book(conn: sqlite3.Connection, draft: bool = False,
                out_dir: Path | None = None) -> tuple[Path, dict[str, int], int]:
    """解説PDF（本編）。draft=True で確認待ちも含めた内部版を作る。"""
    statuses = PUBLIC_STATUSES + (PENDING_STATUSES if draft else ())
    items = collect_items(conn, statuses, only_publishable=not draft)
    out_dir = out_dir or config.OUT_DIR
    name = "交通事故実務デスク_解説書_ドラフト.pdf" if draft else "交通事故実務デスク_解説書.pdf"
    out_path = out_dir / name

    context = {
        "title": "交通事故実務デスク 解説書",
        "subtitle": "整骨院の交通事故実務 Q&A と解説",
        "publisher": config.PUBLISHER,
        "issued_at": date.today().strftime("%Y年%m月%d日"),
        "items": items,
        "chapters": _chapters(items),
        "keyword_index": _keyword_index(items),
        "videos": _videos(conn, items),
        "font_path": str(config.FONT_PATH),
        "draft": draft,
        "show_review_box": False,
    }
    pages = _render_pdf(context, out_path)
    db.set_pdf_pages(conn, pages)
    return out_path, pages, len(items)


def render_review_booklet(conn: sqlite3.Connection, out_dir: Path | None = None) -> tuple[Path, int]:
    """確認待ち別冊PDF（専門家レビュー用）。"""
    items = collect_items(conn, PENDING_STATUSES)
    out_dir = out_dir or config.OUT_DIR
    out_path = out_dir / "交通事故実務デスク_確認待ち_専門家レビュー用.pdf"

    context = {
        "title": "交通事故実務デスク 確認待ち項目",
        "subtitle": "専門家確認用（法律・保険・医療に関わる判断を含む項目）",
        "publisher": config.PUBLISHER,
        "issued_at": date.today().strftime("%Y年%m月%d日"),
        "items": items,
        "chapters": _chapters(items),
        "keyword_index": _keyword_index(items),
        "videos": _videos(conn, items),
        "font_path": str(config.FONT_PATH),
        "draft": True,
        "show_review_box": True,
    }
    _render_pdf(context, out_path)
    return out_path, len(items)


CSV_HEADERS = [
    "ナレッジID", "Q番号", "カテゴリー", "質問", "回答", "関連キーワード",
    "解説PDFページ", "動画タイトル", "該当開始時刻", "該当終了時刻", "元動画URL(時刻付)",
    "根拠テキスト", "確認ステータス", "担当専門家", "品質チェック", "品質メモ",
    "更新確認要", "要確認事項", "動画ID",
]


def export_index(conn: sqlite3.Connection, out_dir: Path | None = None) -> tuple[Path, Path, int]:
    """Q&A索引（CSV / JSON）。CSVはスプレッドシートにそのまま貼れる。"""
    out_dir = out_dir or config.OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    items = collect_items(conn, PUBLIC_STATUSES + PENDING_STATUSES)
    page_by_id = {
        row["id"]: row["pdf_page"]
        for row in conn.execute("SELECT id, pdf_page FROM items").fetchall()
    }

    csv_path = out_dir / "QA索引.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
        for item in items:
            writer.writerow([
                item["id"], item["q_no"], item["category"], item["question"], item["answer_short"],
                "、".join(item["keywords"]), page_by_id.get(item["id"]) or "",
                item["video_title"], item["start_hms"], item["end_hms"], item["timed_url"],
                item["evidence"], item["review_status"], item["expert_type"],
                item["quality_status"], item["quality_notes"],
                "要" if item["outdated"] else "", item["review_points"], item["video_id"],
            ])

    json_path = out_dir / "knowledge.json"
    payload = []
    for item in items:
        record = {k: v for k, v in item.items() if k != "body_html"}
        record["pdf_page"] = page_by_id.get(item["id"])
        payload.append(record)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return csv_path, json_path, len(items)


QC_HEADERS = [
    "ナレッジID", "カテゴリー", "質問", "回答", "根拠テキスト", "品質メモ",
    "元動画URL(時刻付)", "確認ステータス",
]


def export_quality_list(conn: sqlite3.Connection, out_dir: Path | None = None) -> tuple[Path, int]:
    """自動品質チェックで「要目視」になった項目の一覧（院内チェック用）。"""
    out_dir = out_dir or config.OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    items = collect_items(conn, PUBLIC_STATUSES + PENDING_STATUSES)
    flagged = [i for i in items if i["quality_status"] == quality.STATUS_CHECK]

    path = out_dir / "品質要目視リスト.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(QC_HEADERS)
        for item in flagged:
            writer.writerow([
                item["id"], item["category"], item["question"], item["answer_short"],
                item["evidence"], item["quality_notes"], item["timed_url"], item["review_status"],
            ])
    return path, len(flagged)

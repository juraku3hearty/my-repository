"""Vimeo API クライアント。

扱うのは3つだけ。
  1. 動画一覧（アカウント / フォルダ / ショーケース / 他ユーザー）
  2. 字幕トラック一覧（texttracks）
  3. 字幕ファイル本体のダウンロード

注意: texttracks API は「すでにアップロード済みの字幕」を返すだけで、
字幕を自動生成する機能ではない。字幕が無い動画は0件で返る。
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

import config

LIST_FIELDS = "uri,name,link,duration,created_time,release_time,privacy.view"


class VimeoError(RuntimeError):
    pass


@dataclass
class VimeoVideo:
    video_id: str
    title: str
    url: str
    duration_sec: int
    published_at: str

    def as_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "title": self.title,
            "url": self.url,
            "duration_sec": self.duration_sec,
            "published_at": self.published_at,
        }


class VimeoClient:
    def __init__(self, token: str | None = None, timeout: int = 60):
        self.token = config.require("VIMEO_ACCESS_TOKEN", token or config.VIMEO_ACCESS_TOKEN)
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}",
            "Accept": config.VIMEO_API_VERSION,
        })

    # ---- 低レベル ----
    def get(self, path: str, params: dict | None = None, retry: int = 3) -> dict[str, Any]:
        url = path if path.startswith("http") else config.VIMEO_API_BASE + path
        last_error = ""
        for attempt in range(retry):
            res = self.session.get(url, params=params, timeout=self.timeout)
            if res.status_code == 200:
                return res.json()
            if res.status_code == 429:  # レート制限
                wait = int(res.headers.get("Retry-After", 15))
                time.sleep(wait)
                last_error = "429 レート制限"
                continue
            if res.status_code in (500, 502, 503, 504):
                time.sleep(2 ** attempt)
                last_error = f"{res.status_code} サーバーエラー"
                continue
            raise VimeoError(_explain(res.status_code, url, res.text))
        raise VimeoError(f"Vimeo API 失敗（{last_error}）: {url}")

    # ---- 動画一覧 ----
    def list_videos(self, source: str | None = None) -> list[VimeoVideo]:
        path = _source_to_path(source or config.VIMEO_SOURCE)
        videos: list[VimeoVideo] = []
        params = {"per_page": 100, "fields": LIST_FIELDS, "sort": "date", "direction": "asc"}
        page_path: str | None = path
        while page_path:
            data = self.get(page_path, params=params if page_path == path else None)
            for raw in data.get("data", []):
                video = _to_video(raw)
                if video:
                    videos.append(video)
            page_path = (data.get("paging") or {}).get("next")
        return videos

    def get_video(self, video_id: str) -> VimeoVideo | None:
        return _to_video(self.get(f"/videos/{video_id}", params={"fields": LIST_FIELDS}))

    def whoami(self) -> dict:
        return self.get("/me", params={"fields": "uri,name,account"})

    # ---- 字幕 ----
    def list_text_tracks(self, video_id: str) -> list[dict]:
        data = self.get(f"/videos/{video_id}/texttracks")
        return data.get("data", []) or []

    def pick_track(self, tracks: list[dict], prefer_lang: str = "ja") -> dict | None:
        """日本語の字幕/クローズドキャプションを優先して1本選ぶ。"""
        usable = [t for t in tracks if (t.get("type") in ("subtitles", "captions")) and t.get("link")]
        if not usable:
            return None

        def score(track: dict) -> tuple:
            lang = (track.get("language") or "").lower()
            return (
                0 if lang.startswith(prefer_lang) else 1,
                0 if track.get("active") else 1,
                0 if track.get("type") == "captions" else 1,
            )

        return sorted(usable, key=score)[0]

    def download_track(self, track: dict) -> str:
        """字幕本体（VTT/SRT）を取得する。linkは署名付きの一時URLなので認証ヘッダ不要。"""
        link = track.get("link")
        if not link:
            raise VimeoError("字幕トラックに link がありません。")
        res = requests.get(link, timeout=self.timeout)
        if res.status_code != 200:
            raise VimeoError(f"字幕ダウンロード失敗 {res.status_code}: {link}")
        res.encoding = res.encoding or "utf-8"
        return res.text

    # ---- 音声（字幕が無い動画をWhisperに回す場合のみ） ----
    def download_options(self, video_id: str) -> list[dict]:
        """ダウンロード可能なファイル一覧。Pro以上 + video_files スコープが必要。

        権限がなければ空リストを返す（例外にはしない）。
        """
        try:
            data = self.get(f"/videos/{video_id}", params={"fields": "download,files"})
        except VimeoError:
            return []
        options = (data.get("download") or []) + (data.get("files") or [])
        return [o for o in options if o.get("link")]


def _source_to_path(source: str) -> str:
    """VIMEO_SOURCE の指定をAPIパスに変換する。"""
    src = (source or "me").strip()
    if src in ("me", ""):
        return "/me/videos"
    if ":" not in src:
        raise VimeoError(f"VIMEO_SOURCE の形式が不正です: {src}（me / folder:ID / showcase:ID / user:ID）")
    kind, _, ident = src.partition(":")
    ident = ident.strip()
    kind = kind.strip().lower()
    if kind == "folder":      # Vimeoの「フォルダ」= API上の projects
        return f"/me/projects/{ident}/videos"
    if kind == "showcase":    # 「ショーケース」= API上の albums
        return f"/me/albums/{ident}/videos"
    if kind == "user":
        return f"/users/{ident}/videos"
    raise VimeoError(f"VIMEO_SOURCE の種別が不明です: {kind}")


def _to_video(raw: dict) -> VimeoVideo | None:
    uri = raw.get("uri") or ""
    video_id = uri.rsplit("/", 1)[-1] if uri else ""
    if not video_id:
        return None
    return VimeoVideo(
        video_id=video_id,
        title=(raw.get("name") or "").strip() or f"(無題) {video_id}",
        url=raw.get("link") or f"https://vimeo.com/{video_id}",
        duration_sec=int(raw.get("duration") or 0),
        published_at=(raw.get("release_time") or raw.get("created_time") or "")[:10],
    )


def _explain(status: int, url: str, body: str) -> str:
    hints = {
        401: "トークンが無効か期限切れです。Vimeo Developer でトークンを再発行してください。",
        403: "権限不足です。トークンのスコープに private（音声DLなら video_files）が必要です。"
             "他人のアカウントの動画なら、その動画への権限も必要です。",
        404: "対象が見つかりません。動画ID / フォルダID / ショーケースID を確認してください。",
    }
    hint = hints.get(status, "")
    return f"Vimeo API エラー {status}: {url}\n{hint}\n応答: {body[:400]}"

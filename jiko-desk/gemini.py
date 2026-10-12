"""Gemini API 呼び出し（構造化出力固定）。

responseSchema を指定して必ずJSONで返させる。自然文に揺れさせない。
"""
from __future__ import annotations

import json
import time
from typing import Any

import requests

import config


class GeminiError(RuntimeError):
    pass


class Usage:
    """実際に消費したトークンを積算する。

    費用は推定ではなく実測で出す。思考（reasoning）トークンは出力として
    課金されるため、ここを数えないと見積もりが大きく外れる。
    """

    def __init__(self) -> None:
        self.calls = 0
        self.prompt_tokens = 0
        self.output_tokens = 0     # candidatesTokenCount
        self.thought_tokens = 0    # thoughtsTokenCount（課金上は出力に含まれる）
        self.total_tokens = 0
        self.seconds = 0.0

    def add(self, meta: dict, elapsed: float) -> None:
        self.calls += 1
        self.prompt_tokens += int(meta.get("promptTokenCount") or 0)
        self.output_tokens += int(meta.get("candidatesTokenCount") or 0)
        self.thought_tokens += int(meta.get("thoughtsTokenCount") or 0)
        self.total_tokens += int(meta.get("totalTokenCount") or 0)
        self.seconds += elapsed

    @property
    def billed_output(self) -> int:
        """課金対象の出力トークン（回答＋思考）。"""
        return self.output_tokens + self.thought_tokens

    def summary(self) -> str:
        return (f"呼び出し {self.calls}回 / 入力 {self.prompt_tokens:,} / "
                f"出力 {self.output_tokens:,}（うち思考 {self.thought_tokens:,}）/ "
                f"合計 {self.total_tokens:,}トークン / {self.seconds:.1f}秒")


USAGE = Usage()


def _endpoint(model: str) -> str:
    """ストリーミング受信を使う。

    一括受信（generateContent）だと、思考＋長いJSONの生成に30秒以上かかった時点で
    経路のプロキシがタイムアウトし 502 になる。SSEなら数秒で最初のバイトが流れるため
    タイムアウトしない。
    """
    return f"{config.GEMINI_API_BASE}/{model}:streamGenerateContent"


def generate_json(prompt: str,
                  schema: dict,
                  model: str | None = None,
                  temperature: float = 0.2,
                  max_output_tokens: int = 8192) -> Any:
    """プロンプトとスキーマを渡し、パース済みJSONを返す。"""
    # 環境変数にキーがあれば ?key= で送る。無ければネットワークシークレット
    # （プロキシが x-goog-api-key ヘッダーを付与する）に委ねる。
    api_key = config.GEMINI_API_KEY
    model = model or config.GEMINI_MODEL
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }

    last_error = ""
    for attempt in range(config.GEMINI_MAX_RETRY):
        started = time.time()
        params = {"alt": "sse"}
        if api_key:
            params["key"] = api_key
        try:
            res = requests.post(
                _endpoint(model), params=params, json=payload, stream=True, timeout=300
            )
        except requests.RequestException as e:
            last_error = f"通信エラー: {e}"
            time.sleep(2 ** attempt)
            continue

        if res.status_code == 200:
            try:
                text, meta, finish = _read_sse(res)
            except requests.RequestException as e:
                last_error = f"受信中に切断: {e}"
                time.sleep(2 ** attempt)
                continue
            USAGE.add(meta, time.time() - started)
            return _parse_text(text, finish)

        if res.status_code == 429:
            wait = max(config.GEMINI_SLEEP_SEC, 2 ** attempt * 5)
            last_error = "429 レート制限（無料枠の分あたり上限）"
            time.sleep(wait)
            continue
        if res.status_code in (500, 502, 503, 504):
            last_error = f"{res.status_code} サーバーエラー"
            time.sleep(2 ** attempt)
            continue
        if res.status_code == 404:
            raise GeminiError(
                f"モデル {model} が見つかりません（404）。GEMINI_MODEL を見直してください。\n{res.text[:300]}"
            )
        if res.status_code in (400, 401, 403):
            hint = ""
            if not api_key:
                hint = ("\nAPIキーが環境変数に無いため、ネットワークシークレットでの付与を前提にしています。"
                        "ヘッダー名が x-goog-api-key か（Authorization では通りません）、"
                        "プレフィックスが空か、許可ウェブサイトが "
                        "generativelanguage.googleapis.com かを確認してください。")
            raise GeminiError(f"Gemini APIエラー {res.status_code}: {res.text[:400]}{hint}")
        last_error = f"{res.status_code}: {res.text[:200]}"
        time.sleep(2 ** attempt)

    raise GeminiError(f"Gemini 呼び出しが {config.GEMINI_MAX_RETRY} 回失敗しました（{last_error}）")


def _read_sse(res) -> tuple[str, dict, str]:
    """SSEを読み切り、本文テキスト・使用量・終了理由を返す。

    requests の iter_lines は日本語がチャンク境界で壊れることがあるため、
    バイトで受けて自前で行に分ける。
    """
    text_parts: list[str] = []
    usage: dict = {}
    finish = ""
    buffer = b""
    for raw in res.iter_content(chunk_size=None):
        buffer += raw
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            line = line.strip()
            if not line.startswith(b"data: "):
                continue
            try:
                body = json.loads(line[6:].decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            for candidate in body.get("candidates", []):
                finish = candidate.get("finishReason") or finish
                for part in (candidate.get("content") or {}).get("parts", []):
                    if part.get("text"):
                        text_parts.append(part["text"])
            if body.get("usageMetadata"):
                usage = body["usageMetadata"]
    return "".join(text_parts), usage, finish


def _parse_text(text: str, finish: str) -> Any:
    text = (text or "").strip()
    if not text:
        raise GeminiError(f"応答テキストが空です（finishReason={finish}）")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        if finish == "MAX_TOKENS":
            raise GeminiError(
                "出力がトークン上限で切れました。CHUNK_CHAR_LIMIT を小さくしてください。"
            ) from e
        raise GeminiError(f"JSONとして解析できません: {e}\n先頭: {text[:300]}") from e


def throttle() -> None:
    """無料枠のレート制限対策。呼び出しのあいだに待つ。"""
    if config.GEMINI_SLEEP_SEC > 0:
        time.sleep(config.GEMINI_SLEEP_SEC)


# ---- ナレッジ生成用スキーマ ----
def item_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "enum": config.CATEGORIES},
                        "question": {"type": "string"},
                        "answer_short": {"type": "string"},
                        "body_md": {"type": "string"},
                        "evidence_quote": {"type": "string"},
                        "key_points": {"type": "array", "items": {"type": "string"}},
                        "caveats": {"type": "string"},
                        "unknown_points": {"type": "array", "items": {"type": "string"}},
                        "keywords": {"type": "array", "items": {"type": "string"}},
                        "start_time": {"type": "string"},
                        "end_time": {"type": "string"},
                        "needs_expert_review": {"type": "boolean"},
                        "expert_type": {"type": "string", "enum": config.EXPERT_TYPES},
                        "review_points": {"type": "string"},
                        "may_be_outdated": {"type": "boolean"},
                    },
                    "required": [
                        "category", "question", "answer_short", "body_md", "evidence_quote",
                        "key_points", "keywords", "start_time", "end_time",
                        "needs_expert_review", "expert_type", "may_be_outdated",
                    ],
                    "propertyOrdering": [
                        "category", "question", "answer_short", "body_md", "evidence_quote", "key_points",
                        "caveats", "unknown_points", "keywords", "start_time", "end_time",
                        "needs_expert_review", "expert_type", "review_points", "may_be_outdated",
                    ],
                },
            }
        },
        "required": ["items"],
    }


def auth_mode() -> str:
    """どちらの経路で認証しているかを表示用に返す。"""
    return "環境変数" if config.GEMINI_API_KEY else "ネットワークシークレット（プロキシ付与）"

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


def _endpoint(model: str) -> str:
    return f"{config.GEMINI_API_BASE}/{model}:generateContent"


def generate_json(prompt: str,
                  schema: dict,
                  model: str | None = None,
                  temperature: float = 0.2,
                  max_output_tokens: int = 8192) -> Any:
    """プロンプトとスキーマを渡し、パース済みJSONを返す。"""
    api_key = config.require("GEMINI_API_KEY", config.GEMINI_API_KEY)
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
        try:
            res = requests.post(
                _endpoint(model),
                params={"key": api_key},
                json=payload,
                timeout=180,
            )
        except requests.RequestException as e:
            last_error = f"通信エラー: {e}"
            time.sleep(2 ** attempt)
            continue

        if res.status_code == 200:
            return _extract_json(res.json())

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
        if res.status_code in (400, 403):
            raise GeminiError(f"Gemini APIエラー {res.status_code}: {res.text[:500]}")
        last_error = f"{res.status_code}: {res.text[:200]}"
        time.sleep(2 ** attempt)

    raise GeminiError(f"Gemini 呼び出しが {config.GEMINI_MAX_RETRY} 回失敗しました（{last_error}）")


def _extract_json(body: dict) -> Any:
    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        raise GeminiError(f"応答が空です（promptFeedback={json.dumps(feedback, ensure_ascii=False)}）")

    candidate = candidates[0]
    finish = candidate.get("finishReason", "")
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()

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

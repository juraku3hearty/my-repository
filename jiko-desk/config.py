"""設定・辞書類。

環境変数（.env）で上書きできる値と、ナレッジ化の判断に使う固定辞書をまとめる。
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    """依存を増やさないための簡易 .env ローダー。既存の環境変数は上書きしない。"""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")


def _path(env_key: str, default: str) -> Path:
    value = os.environ.get(env_key, default)
    p = Path(value)
    return p if p.is_absolute() else (BASE_DIR / p).resolve()


# ---- API ----
VIMEO_API_BASE = "https://api.vimeo.com"
VIMEO_API_VERSION = "application/vnd.vimeo.*+json;version=3.4"
VIMEO_ACCESS_TOKEN = os.environ.get("VIMEO_ACCESS_TOKEN", "")
VIMEO_SOURCE = os.environ.get("VIMEO_SOURCE", "me")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_SLEEP_SEC = float(os.environ.get("GEMINI_SLEEP_SEC", "4"))
GEMINI_MAX_RETRY = int(os.environ.get("GEMINI_MAX_RETRY", "5"))

# ---- 保存先 ----
DB_PATH = _path("DB_PATH", "data/jiko_desk.sqlite3")
OUT_DIR = _path("OUT_DIR", "out")
CAPTION_DIR = _path("CAPTION_DIR", "data/captions")       # Vimeoから取得した字幕の原本
MANUAL_CAPTION_DIR = _path("MANUAL_CAPTION_DIR", "data/captions_manual")  # 手動・Whisper作成分
AUDIO_DIR = _path("AUDIO_DIR", "data/audio")              # Whisper用の音声
FONT_PATH = _path("FONT_PATH", "../NotoSerifJP-VariableFont_wght.ttf")
PUBLISHER = os.environ.get("PUBLISHER", "交通事故実務デスク")

# ---- 文字起こしの分割 ----
CHUNK_CHAR_LIMIT = int(os.environ.get("CHUNK_CHAR_LIMIT", "4000"))
CHUNK_OVERLAP_CUES = int(os.environ.get("CHUNK_OVERLAP_CUES", "2"))

# ---- 状態値 ----
class CaptionState:
    NONE = "字幕なし"
    VIMEO = "Vimeo字幕"
    MANUAL = "手動/Whisper"


class ReviewStatus:
    """専門家確認（法律・保険・医療の判断）の軸。"""
    PENDING = "確認待ち"
    APPROVED = "確認済"
    REJECTED = "要修正"
    NOT_REQUIRED = "確認不要"


class InternalStatus:
    """院内確認（実務責任者＝院長）の軸。生成直後はすべて未確認から始まる。

    自動生成された項目を会員へ自動公開しないための関門。根拠照合は文字起こしとの
    一致を見るだけで、実務上の正しさは保証しないため、必ず人が一度通す。
    """
    UNCHECKED = "院内未確認"
    APPROVED = "院内確認済"
    REJECTED = "院内要修正"


class VideoStatus:
    NEW = "未処理"
    TRANSCRIBED = "字幕取得済"
    NO_CAPTION = "字幕なし"
    BUILT = "ナレッジ生成済"
    ERROR = "エラー"


# ---- カテゴリー（AIにはこの中から選ばせる。章立てもこの順） ----
CATEGORIES = [
    "初診・受付対応",
    "保険会社対応",
    "自賠責保険",
    "任意保険・人身傷害",
    "健康保険の併用",
    "施術内容・通院頻度",
    "文書作成（施術証明書・同意書）",
    "打切り・治療終了",
    "後遺障害",
    "損害賠償・示談",
    "弁護士対応・紛争",
    "請求・レセプト実務",
    "患者説明・トラブル対応",
    "その他",
]

EXPERT_TYPES = ["弁護士", "保険", "医療", "行政", "なし"]

# AIの自己申告だけに任せず、キーワードでも要確認を拾う（二重の安全弁）。
#   strong : その語が出た時点で専門家確認に回す（判断そのものを含む語）
#   weak   : 単独では回さない。同一文で2語以上、または判断表現と同居したときだけ回す
#            （「保険会社から連絡が来ているか確認する」のような手順の説明を巻き込まないため）
EXPERT_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "弁護士": {
        "strong": [
            "過失割合", "示談", "訴訟", "裁判", "慰謝料", "損害賠償", "時効",
            "違法", "刑事", "債務不履行", "調停", "内払", "求償",
        ],
        "weak": ["弁護士", "紛争", "責任", "賠償", "交渉"],
    },
    "保険": {
        "strong": [
            "打切り", "打ち切り", "限度額", "120万", "仮渡金", "一括対応",
            "人身傷害", "第三者行為",
        ],
        "weak": ["自賠責", "任意保険", "保険会社", "同意書", "対人賠償", "搭乗者傷害", "保険者"],
    },
    "医療": {
        "strong": ["後遺障害", "症状固定", "診断書", "画像所見", "施術の適切性", "併給"],
        "weak": ["診断", "医師", "整形外科", "MRI", "投薬", "適応", "治癒"],
    },
    "行政": {
        "strong": ["受領委任", "療養費", "通達", "返還", "指導監査", "広告規制"],
        "weak": ["厚生労働省", "保健所", "施術管理者", "監査"],
    },
}

# 「〜してよい」「〜できる」のような判断を示す表現。弱シグナル語と同じ文に出たら確認に回す
JUDGEMENT_PATTERNS = [
    "してよい", "しても良い", "しても構わない", "できます", "できる", "請求でき",
    "認められ", "認定", "義務", "違反", "禁止", "負担", "支払われ", "対象となる",
    "対象外", "必要です", "必須", "すべき", "してはいけない", "できません",
]

# 制度変更の影響を受けやすい語（更新確認フラグ）
OUTDATED_KEYWORDS = [
    "改正", "令和", "平成", "年度", "料金改定", "点数", "通達", "新制度",
    "移行", "廃止", "改定", "現在は",
]


def require(name: str, value: str) -> str:
    if not value:
        raise SystemExit(
            f"環境変数 {name} が未設定です。jiko-desk/.env.example を .env にコピーして設定してください。"
        )
    return value

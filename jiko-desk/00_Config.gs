/**
 * 交通事故実務デスク — 動画ナレッジ化システム
 * 00_Config.gs : 全体設定とスクリプトプロパティの読み出し
 *
 * スクリプトプロパティ（必須）
 *   SPREADSHEET_ID       : ナレッジを書き込むスプレッドシートID
 *   VIMEO_ACCESS_TOKEN   : Vimeoのアクセストークン（scope: public private video_files）
 *   GEMINI_API_KEY       : Google AI Studio の APIキー
 * スクリプトプロパティ（任意）
 *   VIMEO_SOURCE         : 取得元。me / folder:123456 / showcase:123456 / user:123456（既定 me）
 *   GEMINI_MODEL         : 既定 gemini-2.5-flash（No.2と揃えるなら gemini-3.5-flash）
 *   VTT_DRIVE_FOLDER_ID  : 字幕なし動画用。手動作成VTTを置くDriveフォルダID
 */

const CONFIG = {
  // ---- API ----
  VIMEO_API_BASE: 'https://api.vimeo.com',
  VIMEO_API_VERSION: 'application/vnd.vimeo.*+json;version=3.4',
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_MODEL_DEFAULT: 'gemini-2.5-flash',

  // ---- シート名 ----
  SHEET_VIDEOS: '動画一覧',
  SHEET_KNOWLEDGE: 'ナレッジ',
  SHEET_REVIEW: '要確認キュー',
  SHEET_TRANSCRIPT: '文字起こし',
  SHEET_SEARCH: '検索',
  SHEET_CATEGORY: 'カテゴリー',
  SHEET_LOG: 'ログ',

  // ---- 実行時間管理（GAS無料枠は6分で強制終了）----
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,

  // ---- 文字起こしの分割 ----
  CHUNK_CHAR_LIMIT: 4000,   // 1回のGemini呼び出しに渡す文字数の上限
  CHUNK_OVERLAP_CUES: 2,    // チャンク境界で話題が切れないように重ねる字幕キュー数
  CELL_CHAR_LIMIT: 45000,   // スプレッドシート1セルの安全上限（実上限50000）

  // ---- ステータス値 ----
  STATUS: {
    NEW: '未処理',
    TRANSCRIBED: '字幕取得済',
    NO_CAPTION: '字幕なし',
    KNOWLEDGE_DONE: 'ナレッジ生成済',
    ERROR: 'エラー'
  },
  REVIEW_STATUS: {
    PENDING: '確認待ち',
    APPROVED: '確認済',
    REJECTED: '要修正',
    NOT_REQUIRED: '確認不要'
  }
};

/** 動画一覧シートの列定義（1始まり） */
const COL_VIDEO = {
  VIDEO_ID: 1,
  TITLE: 2,
  URL: 3,
  DURATION: 4,
  PUBLISHED_AT: 5,
  CAPTION_STATE: 6,
  TRANSCRIPT_AT: 7,
  KNOWLEDGE_AT: 8,
  KNOWLEDGE_COUNT: 9,
  STATUS: 10,
  NOTE: 11
};
const VIDEO_HEADERS = [
  '動画ID', '動画タイトル', '動画URL', '再生時間(秒)', '公開日',
  '字幕状態', '字幕取得日時', 'ナレッジ生成日時', 'ナレッジ件数', '処理ステータス', '備考'
];

/** ナレッジシートの列定義（1始まり） */
const COL_KB = {
  ID: 1,
  CATEGORY: 2,
  QUESTION: 3,
  ANSWER: 4,
  KEYWORDS: 5,
  VIDEO_TITLE: 6,
  VIDEO_URL: 7,
  START_TIME: 8,
  END_TIME: 9,
  REVIEW_STATUS: 10,
  REVIEW_POINTS: 11,
  EXPERT_TYPE: 12,
  OUTDATED_FLAG: 13,
  VIDEO_ID: 14,
  CREATED_AT: 15,
  UPDATED_AT: 16
};
const KB_HEADERS = [
  'ナレッジID', 'カテゴリー', '質問', '回答候補', '関連キーワード',
  '動画タイトル', '元動画URL', '該当開始時刻', '該当終了時刻',
  '確認ステータス', '要確認事項', '担当専門家', '更新確認要', '動画ID', '生成日時', '更新日時'
];

/** 要確認キューシートの列定義（1始まり） */
const COL_REVIEW = {
  KB_ID: 1,
  EXPERT_TYPE: 2,
  CATEGORY: 3,
  QUESTION: 4,
  ANSWER: 5,
  REVIEW_POINTS: 6,
  VIDEO_URL: 7,
  REQUESTED_AT: 8,
  REVIEWER: 9,
  REVIEWED_AT: 10,
  JUDGEMENT: 11,
  COMMENT: 12
};
const REVIEW_HEADERS = [
  'ナレッジID', '担当専門家', 'カテゴリー', '質問', '回答候補', '要確認事項',
  '元動画URL(時刻付)', '登録日時', '確認者', '確認日時', '判定', 'コメント'
];

/** 文字起こしシートの列定義（1始まり） */
const COL_TR = {
  VIDEO_ID: 1,
  TITLE: 2,
  PART: 3,
  SOURCE: 4,
  FETCHED_AT: 5,
  BODY: 6
};
const TR_HEADERS = ['動画ID', '動画タイトル', '分割番号', '取得元', '取得日時', '本文(時刻付)'];

/** カテゴリーマスタ（AIにはこの中から選ばせる） */
const CATEGORIES = [
  '初診・受付対応',
  '保険会社対応',
  '自賠責保険',
  '任意保険・人身傷害',
  '健康保険の併用',
  '施術内容・通院頻度',
  '文書作成（施術証明書・同意書）',
  '打切り・治療終了',
  '後遺障害',
  '損害賠償・示談',
  '弁護士対応・紛争',
  '請求・レセプト実務',
  '患者説明・トラブル対応',
  'その他'
];

/** 専門家区分 */
const EXPERT_TYPES = ['弁護士', '保険', '医療', '行政', 'なし'];

/**
 * 法律・保険・医療に関わる判断を含む可能性のある語。
 * AIの自己申告だけに任せず、キーワードでも必ず要確認に回す（二重の安全弁）。
 */
const EXPERT_KEYWORDS = {
  '弁護士': ['過失割合', '示談', '訴訟', '裁判', '弁護士', '慰謝料', '損害賠償', '時効', '違法', '刑事', '債務不履行', '内払', '求償'],
  '保険': ['自賠責', '任意保険', '人身傷害', '打切り', '打ち切り', '保険会社', '一括対応', '同意書', '求償', '限度額', '120万', '仮渡金'],
  '医療': ['診断', '診断書', '後遺障害', 'MRI', '医師', '整形外科', '併給', '症状固定', '投薬', '画像所見', '施術の適切性'],
  '行政': ['療養費', '受領委任', '厚生労働省', '保健所', '広告規制', '施術管理者', '受領委任制度', '通達']
};

/** 制度変更の影響を受けやすい語（更新確認要フラグ） */
const OUTDATED_KEYWORDS = ['改正', '令和', '平成', '年度', '料金改定', '点数', '通達', '新制度', '移行', '廃止'];

/** スクリプトプロパティ取得（必須） */
function prop_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
  return v;
}

/** スクリプトプロパティ取得（任意） */
function propOpt_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v || fallback || '';
}

/** 対象スプレッドシート */
function ss_() {
  return SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
}

/** 使用するGeminiモデル */
function geminiModel_() {
  return propOpt_('GEMINI_MODEL', CONFIG.GEMINI_MODEL_DEFAULT);
}

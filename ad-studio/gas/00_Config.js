/**
 * 広告動画工房 — 設定
 * スクリプトプロパティ:
 *   GEMINI_API_KEY   … Google AI Studio のAPIキー(台本生成のデフォルト)
 *   ANTHROPIC_API_KEY … (任意) 台本LLMをclaudeにする場合のみ
 *   SPREADSHEET_ID   … 管理用スプレッドシートのID
 *   LINE_CHANNEL_ACCESS_TOKEN … (任意) 完成通知をLINEに送る場合
 *   LINE_USER_ID              … (任意) 通知先ユーザーID
 */
const ADS = {
  props() {
    return PropertiesService.getScriptProperties();
  },
  get(key, fallback) {
    const v = this.props().getProperty(key);
    if (!v && fallback === undefined) {
      throw new Error('スクリプトプロパティ ' + key + ' が未設定です');
    }
    return v || fallback;
  },
  ss() {
    return SpreadsheetApp.openById(this.get('SPREADSHEET_ID'));
  },
  sheet(name) {
    const sh = this.ss().getSheetByName(name);
    if (!sh) throw new Error('シートがありません: ' + name + ' — initialize() を実行してください');
    return sh;
  },

  GEMINI_MODEL: 'gemini-2.0-flash-lite',

  // シート名(ワーカー側 worker/src/sheets.js と一致させること)
  SHEETS: {
    CATEGORIES: '事業カテゴリ',
    VOICES: 'ボイス一覧',
    STORES: '店舗一覧',
    MATERIALS: '素材ライブラリ',
    SCRIPTS: '台本',
    JOBS: 'ジョブ',
    VARIANTS: 'バリアント',
    RESULTS: 'AB結果',
    REPORT: 'ABレポート',
    REPORT_STORES: '店舗比較',
    SETTINGS: '設定',
  },
};

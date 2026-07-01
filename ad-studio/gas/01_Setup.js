/**
 * 初期セットアップ。SPREADSHEET_ID を設定してから initialize() を一度実行する。
 * 既存シートは壊さない(無いものだけ作る)。
 */
function initialize() {
  const ss = ADS.ss();

  const categories = createSheetIfMissing_(ss, ADS.SHEETS.CATEGORIES, [
    'カテゴリ', 'サービス内容', '強み・訴求の軸', 'NG表現・注意点', 'ボイスID(空=デフォルト)',
  ]);
  if (categories.getLastRow() === 1) {
    categories.getRange(2, 1, 3, 5).setValues([
      ['脱毛', '光脱毛(サロン脱毛)', '痛みが少ない・通いやすい価格・整骨院併設の安心感',
       '「永久脱毛」「医療脱毛」という表現は使わない(医療行為と誤認NG)。効果の断定・ビフォーアフターの保証表現NG', ''],
      ['整体', '骨盤矯正・姿勢改善・肩こり腰痛ケア', '国家資格者による施術・根本原因へのアプローチ',
       '「治る」「治療」と断定しない。医療広告ガイドラインに配慮し体験談の効果保証NG', ''],
      ['睡眠', '睡眠の質改善サポート(姿勢・自律神経ケア)', '眠りの悩みに寄り添う・整体との相乗効果',
       '「不眠症が治る」等の医療的断定NG。効果効能は個人差がある前提の表現にする', ''],
    ]);
  }

  createSheetIfMissing_(ss, ADS.SHEETS.STORES, [
    '店舗', 'エンド素材ID(店舗情報クリップ)', 'メモ',
  ]);
  // 各店舗の締め(住所・電話・地図など)のクリップを素材ライブラリに登録し、その素材IDをここに紐付ける。
  // ジョブ発行時に店舗を指定すると、本体は共通のままエンドカードだけ差し替えて店舗の数だけ動画が作られる

  createSheetIfMissing_(ss, ADS.SHEETS.VOICES, [
    'ボイスID(Fish Audio reference_id)', '名前', '性別', '声の印象・トーン', 'メモ',
  ]);
  // 例: xxxxxxxx | スタッフA | 女性 | 明るく親しみやすい | 受付担当

  createSheetIfMissing_(ss, ADS.SHEETS.MATERIALS, [
    '素材ID', 'ファイル名', 'DriveファイルID', '種類', 'タグ', '長さ(秒)', 'メモ', '登録日',
  ]);
  // 種類の例: 施術風景 / 院内 / 外観 / 受付 / スタッフ / その他

  createSheetIfMissing_(ss, ADS.SHEETS.SCRIPTS, [
    '台本ID', '作成日', 'ターゲット', '訴求ポイント', 'フック(冒頭)', '本文', 'CTA', '秒数目安', 'ステータス', 'カテゴリ',
    '推奨ボイスID', '推奨ボイス(名前・理由)',
  ]);
  // 注: 列順はワーカー(worker/src/sheets.js)が参照するため、追加は末尾のみ

  createSheetIfMissing_(ss, ADS.SHEETS.JOBS, [
    'ジョブID', '種別', '状態', '台本ID', '素材ID(カンマ区切り)', '動画プロンプト',
    '音声ボイスID', '出力DriveID', '出力URL', '作成コスト(円)', 'エラー', '作成日時', '更新日時', 'ワーカーメモ',
    'エンド素材ID(店舗)',
  ]);
  // 種別: full(台本→音声→動画→合成) / voice / video / assemble
  // 状態: pending → processing → done / error(ワーカーが更新)

  createSheetIfMissing_(ss, ADS.SHEETS.VARIANTS, [
    'バリアントID', 'ジョブID', '名前', '台本ID', '媒体', '出力URL', '公開日', 'ステータス', 'メモ', 'カテゴリ', '店舗',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.RESULTS, [
    '日付', 'バリアントID', '媒体', '表示回数', '再生数', 'クリック', '予約数', '費用(円)', '店舗',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.REPORT, [
    'バリアントID', '名前', 'カテゴリ', '媒体', '表示回数', 'クリック', 'CTR', '予約数', 'CVR',
    '広告費合計', '作成コスト', '総コスト', 'CPA(円/予約)', '判定',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.REPORT_STORES, [
    'カテゴリ', '店舗', '表示回数', 'クリック', 'CTR', '予約数', 'CVR', '広告費', 'CPA(広告費のみ・円/予約)',
  ]);
  // 内容(カテゴリ)ごとに店舗間の成績差を見る。作成コストは店舗をまたいで共有なので広告費ベースで比較

  const settings = createSheetIfMissing_(ss, ADS.SHEETS.SETTINGS, ['キー', '値', '説明']);
  if (settings.getLastRow() === 1) {
    settings.getRange(2, 1, 5, 3).setValues([
      ['院名', 'じゅらく整骨院', '台本生成に使用'],
      ['デフォルトボイスID', '', 'Fish Audio の reference_id(声モデルID)'],
      ['動画の長さ(秒)', '90', '広告1本の目安(90〜120秒の短尺特化)'],
      ['アスペクト比', '9:16', '縦型(リール/ショート向け)'],
      ['台本LLM', 'gemini', 'gemini(無料) / claude(高品質・要ANTHROPIC_API_KEY)'],
    ]);
  }

  SpreadsheetApp.flush();
  Logger.log('セットアップ完了。素材ライブラリに撮影済み動画のDriveファイルIDを登録してください。');
}

function createSheetIfMissing_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 設定シートから値を読む */
function getSetting_(key, fallback) {
  const values = ADS.sheet(ADS.SHEETS.SETTINGS).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key && values[i][1] !== '') return values[i][1];
  }
  return fallback;
}

/** ID採番: prefix + yyyyMMddHHmmss + 乱数2桁 */
function newId_(prefix) {
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss');
  return prefix + '-' + ts + '-' + Math.floor(Math.random() * 90 + 10);
}

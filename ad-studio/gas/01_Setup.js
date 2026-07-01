/**
 * 初期セットアップ。SPREADSHEET_ID を設定してから initialize() を一度実行する。
 * 既存シートは壊さない(無いものだけ作る)。
 */
function initialize() {
  const ss = ADS.ss();

  createSheetIfMissing_(ss, ADS.SHEETS.MATERIALS, [
    '素材ID', 'ファイル名', 'DriveファイルID', '種類', 'タグ', '長さ(秒)', 'メモ', '登録日',
  ]);
  // 種類の例: 施術風景 / 院内 / 外観 / 受付 / スタッフ / その他

  createSheetIfMissing_(ss, ADS.SHEETS.SCRIPTS, [
    '台本ID', '作成日', 'ターゲット', '訴求ポイント', 'フック(冒頭)', '本文', 'CTA', '秒数目安', 'ステータス',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.JOBS, [
    'ジョブID', '種別', '状態', '台本ID', '素材ID(カンマ区切り)', '動画プロンプト',
    '音声ボイスID', '出力DriveID', '出力URL', '作成コスト(円)', 'エラー', '作成日時', '更新日時', 'ワーカーメモ',
  ]);
  // 種別: full(台本→音声→動画→合成) / voice / video / assemble
  // 状態: pending → processing → done / error(ワーカーが更新)

  createSheetIfMissing_(ss, ADS.SHEETS.VARIANTS, [
    'バリアントID', 'ジョブID', '名前', '台本ID', '媒体', '出力URL', '公開日', 'ステータス', 'メモ',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.RESULTS, [
    '日付', 'バリアントID', '媒体', '表示回数', '再生数', 'クリック', '予約数', '費用(円)',
  ]);

  createSheetIfMissing_(ss, ADS.SHEETS.REPORT, [
    'バリアントID', '名前', '媒体', '表示回数', 'クリック', 'CTR', '予約数', 'CVR',
    '広告費合計', '作成コスト', '総コスト', 'CPA(円/予約)', '判定',
  ]);

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

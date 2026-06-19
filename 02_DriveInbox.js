/**
 * Googleドライブ経由でX投稿アナリティクスを自動入力（LINE不要・回数制限なし）
 *
 * 使い方:
 *   「X投稿アナリティクス_受信」フォルダにスクショを入れるだけ。
 *   数分おきに自動で読み取り → シート追記 → 画像は「_処理済み」へ移動。
 *
 * 初回セットアップ（GASエディタで1回ずつ実行）:
 *   1. xaSetupDriveFolders   … フォルダを作成（ログにURLが出る）
 *   2. xaInstallTrigger      … 5分おきの自動処理をON
 *   ※ GEMINI_API_KEY のスクリプトプロパティ設定が前提（01_XAnalytics.js参照）
 *
 * ファイル名をメモにしたいとき: 「2026-06-19_朝の挨拶.png」のように付ければ
 *   日付(YYYY-MM-DD)とメモを自動で取り込む。
 */

var XA_INBOX_NAME = 'X投稿アナリティクス_受信';
var XA_DONE_NAME  = 'X投稿アナリティクス_処理済み';

/** 受信/処理済みフォルダを作成（既にあれば再利用）。URLをログ出力。 */
function xaSetupDriveFolders() {
  var inbox = xaGetOrCreateFolder_('XA_INBOX_FOLDER_ID', XA_INBOX_NAME);
  var done  = xaGetOrCreateFolder_('XA_DONE_FOLDER_ID', XA_DONE_NAME);
  Logger.log('受信フォルダ（ここにスクショを入れる）: ' + inbox.getUrl());
  Logger.log('処理済みフォルダ: ' + done.getUrl());
  return { inbox: inbox.getUrl(), done: done.getUrl() };
}

function xaGetOrCreateFolder_(propKey, name) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(propKey);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 消えてたら作り直す */ }
  }
  // 同名フォルダがあれば拾う、なければ作る
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

/** 5分おきの自動処理トリガーを設定（重複作成しない）。 */
function xaInstallTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'processDriveInbox';
  });
  if (!exists) {
    ScriptApp.newTrigger('processDriveInbox').timeBased().everyMinutes(5).create();
  }
  Logger.log('自動処理トリガーを設定しました（5分おき）');
}

/** 受信フォルダの画像を全部処理する（トリガーから自動実行）。 */
function processDriveInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // 前回処理が動作中ならスキップ
  try {
    var inbox = xaGetOrCreateFolder_('XA_INBOX_FOLDER_ID', XA_INBOX_NAME);
    var done  = xaGetOrCreateFolder_('XA_DONE_FOLDER_ID', XA_DONE_NAME);
    var files = inbox.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType() || '';
      if (mime.indexOf('image/') !== 0) continue; // 画像以外は触らない
      try {
        var data = extractXMetricsFromImage_(file.getBlob());
        var meta = xaParseFileName_(file.getName());
        data.memo = meta.memo;
        if (meta.date) data.date = meta.date;
        appendXRow_(data);
        file.moveTo(done); // 成功したものだけ処理済みへ
      } catch (e) {
        Logger.log('処理失敗(' + file.getName() + '): ' + e.message);
        // 失敗ファイルは受信フォルダに残す（次回再挑戦）
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** ファイル名から日付(YYYY-MM-DD)とメモを取り出す。 */
function xaParseFileName_(name) {
  var base = name.replace(/\.[^.]+$/, ''); // 拡張子除去
  var m = base.match(/(\d{4}-\d{2}-\d{2})/);
  var date = m ? m[1].replace(/-/g, '/') : '';
  var memo = base.replace(/\d{4}-\d{2}-\d{2}/, '').replace(/^[_\-\s]+|[_\-\s]+$/g, '').trim();
  return { date: date, memo: memo };
}

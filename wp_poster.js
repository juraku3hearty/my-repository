/**
 * WordPress 一括投稿ツール(スプレッドシート → WordPress REST API)
 *
 * 使い方:
 *  1. WordPress側: ユーザー > プロフィール > アプリケーションパスワードを発行
 *  2. GASエディタ > プロジェクトの設定 > スクリプト プロパティ に以下を登録
 *     WP_URL      = https://あなたのサイト.com (末尾スラッシュなし)
 *     WP_USER     = WordPressのユーザー名
 *     WP_APP_PASS = 発行したアプリケーションパスワード(スペース込みでそのまま)
 *  3. setupPostSheet() を一度実行 →「投稿キュー」シートができる
 *  4. シートに記事を書き、ステータスを「投稿する」にして postQueued() を実行
 *     (毎時自動投稿にしたい場合は createPostTrigger() を一度実行)
 *
 * シート列: A:ステータス B:タイトル C:本文(HTML可) D:カテゴリ E:タグ
 *           F:アイキャッチ画像URL G:公開状態(publish/draft) H:投稿後URL I:投稿日時 J:メモ
 */

const WP_SHEET_NAME = '投稿キュー';
const WP_STATUS_QUEUE = '投稿する';
const WP_STATUS_DONE = '投稿済み';
const WP_STATUS_ERROR = 'エラー';

function wpConfig_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('WP_URL');
  const user = p.getProperty('WP_USER');
  const pass = p.getProperty('WP_APP_PASS');
  if (!url || !user || !pass) {
    throw new Error('スクリプトプロパティ WP_URL / WP_USER / WP_APP_PASS を設定してください');
  }
  return {
    base: url.replace(/\/+$/, '') + '/wp-json/wp/v2',
    auth: 'Basic ' + Utilities.base64Encode(user + ':' + pass),
  };
}

/** 「投稿キュー」シートを作成(初回のみ実行) */
function setupPostSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(WP_SHEET_NAME)) {
    SpreadsheetApp.getUi().alert('「' + WP_SHEET_NAME + '」シートは既にあります');
    return;
  }
  const sh = ss.insertSheet(WP_SHEET_NAME);
  const headers = ['ステータス', 'タイトル', '本文(HTML可)', 'カテゴリ', 'タグ(カンマ区切り)',
    'アイキャッチ画像URL', '公開状態(publish/draft)', '投稿後URL', '投稿日時', 'メモ'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#18263c').setFontColor('#fff');
  sh.setFrozenRows(1);
  sh.getRange('A2:A100').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['下書き中', WP_STATUS_QUEUE, WP_STATUS_DONE, WP_STATUS_ERROR], true).build()
  );
  sh.getRange('G2:G100').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['publish', 'draft'], true).build()
  );
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 420);
}

/** ステータスが「投稿する」の行をすべてWordPressに投稿 */
function postQueued() {
  const cfg = wpConfig_();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WP_SHEET_NAME);
  if (!sh) throw new Error('「' + WP_SHEET_NAME + '」シートがありません。setupPostSheet() を実行してください');

  const rows = sh.getDataRange().getValues();
  let posted = 0;
  for (let i = 1; i < rows.length; i++) {
    const [status, title, content, category, tags, imageUrl, pubState] = rows[i];
    if (status !== WP_STATUS_QUEUE || !title) continue;
    try {
      const payload = {
        title: String(title),
        content: String(content || ''),
        status: pubState === 'draft' ? 'draft' : 'publish',
      };
      if (category) payload.categories = [resolveTerm_(cfg, 'categories', String(category).trim())];
      if (tags) {
        payload.tags = String(tags).split(/[,、]/).map(function(t){ return t.trim(); }).filter(String)
          .map(function(t){ return resolveTerm_(cfg, 'tags', t); });
      }
      if (imageUrl) {
        const mediaId = uploadMediaFromUrl_(cfg, String(imageUrl).trim(), String(title));
        if (mediaId) payload.featured_media = mediaId;
      }
      const res = wpFetch_(cfg, '/posts', 'post', payload);
      sh.getRange(i + 1, 1).setValue(WP_STATUS_DONE);
      sh.getRange(i + 1, 8).setValue(res.link || '');
      sh.getRange(i + 1, 9).setValue(new Date());
      posted++;
    } catch (err) {
      sh.getRange(i + 1, 1).setValue(WP_STATUS_ERROR);
      sh.getRange(i + 1, 10).setValue(String(err.message).slice(0, 200));
    }
  }
  Logger.log(posted + '件投稿しました');
}

/** カテゴリ/タグ名をIDに変換(なければ作成) */
function resolveTerm_(cfg, type, name) {
  const found = wpFetch_(cfg, '/' + type + '?search=' + encodeURIComponent(name) + '&per_page=20', 'get');
  for (let i = 0; i < found.length; i++) {
    if (found[i].name === name) return found[i].id;
  }
  const created = wpFetch_(cfg, '/' + type, 'post', { name: name });
  return created.id;
}

/** 画像URLからアイキャッチをアップロード */
function uploadMediaFromUrl_(cfg, url, title) {
  const img = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) return null;
  const blob = img.getBlob();
  const ext = (blob.getContentType() || 'image/jpeg').split('/')[1].replace('jpeg', 'jpg');
  const res = UrlFetchApp.fetch(cfg.base + '/media', {
    method: 'post',
    headers: {
      Authorization: cfg.auth,
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(title).slice(0, 40) + '.' + ext + '"',
    },
    contentType: blob.getContentType(),
    payload: blob.getBytes(),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) return null;
  return JSON.parse(res.getContentText()).id;
}

function wpFetch_(cfg, path, method, payload) {
  const opt = {
    method: method,
    headers: { Authorization: cfg.auth },
    muteHttpExceptions: true,
  };
  if (payload) {
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(cfg.base + path, opt);
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('WP API ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

/** 毎時自動投稿のトリガーを設定(任意・一度だけ実行) */
function createPostTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'postQueued') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('postQueued').timeBased().everyHours(1).create();
}

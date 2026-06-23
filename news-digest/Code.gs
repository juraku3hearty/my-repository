/**
 * 毎朝ニュース 設定ページ（GAS Web App）＋ 登録の保存
 * ------------------------------------------------------------------
 * picker.html を表示し、登録ボタンで「メール＋選んだ分野」を
 * あなたのスプレッドシートに保存する。これが登録者リストになり、
 * 毎朝の配信（別ファイルの送信処理）がこのリストを読む。
 *
 * 【設置】
 *  1. スプレッドシートを1つ用意（登録者リスト用）
 *  2. 拡張機能→Apps Script に、この Code.gs と picker.html を入れる
 *     （picker.html は「ファイル＋→HTML」で picker という名前で作って中身を貼る）
 *  3. REG_SHEET_ID にそのスプレッドシートのID を入れる
 *  4. デプロイ→「新しいデプロイ」→ウェブアプリ→アクセス「全員」→URLを発行
 *  5. そのURLが「アプリっぽい入口」。Zoomで見せたり、社長に送ったり。
 */

const REG_SHEET_ID = '';      // ← 登録者リストのスプレッドシートID（空なら、このスクリプトを束ねたシート）
const REG_TAB = '登録';

/** Web App のページ表示／配信停止 */
function doGet(e) {
  if (e && e.parameter && e.parameter.unsub) {
    return unsubscribe_(e.parameter.unsub);
  }
  return HtmlService.createHtmlOutputFromFile('picker')
    .setTitle('毎朝ニュース ｜ 設定')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/** 配信停止：該当メールの「配信」列を停止にする */
function unsubscribe_(email) {
  const ss = REG_SHEET_ID ? SpreadsheetApp.openById(REG_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss ? ss.getSheetByName(REG_TAB) : null;
  let done = false;
  if (sh && sh.getLastRow() >= 2) {
    const emails = sh.getRange(2, 4, sh.getLastRow() - 1, 1).getValues(); // D=メール
    for (let i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
        sh.getRange(i + 2, 6).setValue('停止'); // F=配信
        done = true;
        break;
      }
    }
  }
  const msg = done ? '配信を停止しました。ご利用ありがとうございました。'
                   : '対象のアドレスが見つかりませんでした。';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;text-align:center;padding:48px 20px">' +
    '<div style="font-size:40px">📭</div><h2 style="font-size:18px">' + msg + '</h2></div>'
  );
}

/** 登録を保存（画面の google.script.run から呼ばれる） */
function saveRegistration(data) {
  const ss = REG_SHEET_ID
    ? SpreadsheetApp.openById(REG_SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(REG_TAB);
  if (!sh) {
    sh = ss.insertSheet(REG_TAB);
    sh.appendRow(['登録日時', '会社名', 'お名前', 'メール', '分野', '配信']);
  }
  const company = String(data && data.company || '').trim();
  const name = String(data && data.name || '').trim();
  const email = String(data && data.email || '').trim();
  const topics = (data && data.topics || []).join(', ');
  if (!email || !topics) throw new Error('メールと分野が必要です');

  // 既に同じメールがあれば情報を上書き（再登録に対応）。メール列＝D列(4)
  const last = sh.getLastRow();
  if (last >= 2) {
    const emails = sh.getRange(2, 4, last - 1, 1).getValues();
    for (let i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).trim().toLowerCase() === email.toLowerCase()) {
        const row = i + 2;
        sh.getRange(row, 1, 1, 5).setValues([[new Date(), company, name, email, topics]]);
        return true;
      }
    }
  }
  sh.appendRow([new Date(), company, name, email, topics, '有効']);
  return true;
}

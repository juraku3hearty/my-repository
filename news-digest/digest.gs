/**
 * 毎朝ニュース 配信エンジン（設定シート対応版）
 * ------------------------------------------------------------------
 * 「設定」タブの値で、差出人名(会社名)・件名・本数・対象時間・フッターを
 * コードを触らずに変更できる。配信先は「登録」タブ（Code.gs と同じブック）。
 *
 * 【まず"届くか"テスト】 testDigest を実行 → 自分宛に1通
 * 【登録者へ配信】       sendDailyDigests に毎朝のトリガーを設定
 * 【内容を変える】       「設定」タブの値を書き換えるだけ（会社名・件名など）
 */

const DIGEST_MAX = 12;      // 1通あたりの最大本数（安全上限）

/** 設定タブを読む（無ければ作る）。会社名・件名などの“入口”。
 *  スプレッドシートが無い（単体プロジェクトでのテスト）ときはデフォルト値を返す。 */
function getSettings_(ss) {
  const def = { senderName:'毎朝ニュース', subject:'☀️ 今朝のニュース', perTopic:3, recentHours:30, footer:'毎朝ニュース' };
  if (!ss) return def;
  let sh = ss.getSheetByName('設定');
  if (!sh) {
    sh = ss.insertSheet('設定');
    sh.getRange('A1:B5').setValues([
      ['差出人名（会社名）', '毎朝ニュース'],
      ['メールの件名',       '☀️ 今朝のニュース'],
      ['1分野あたりの本数',   3],
      ['対象とする直近時間',   30],
      ['フッター文',          '毎朝ニュース']
    ]);
    sh.getRange('A1:A5').setFontWeight('bold');
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 280);
    sh.getRange('A7').setValue('★ここの値を変えると配信内容が変わります（コード不要）');
  }
  const v = sh.getRange('B1:B5').getValues();
  return {
    senderName:  String(v[0][0] || '毎朝ニュース'),
    subject:     String(v[1][0] || '☀️ 今朝のニュース'),
    perTopic:    parseInt(v[2][0], 10) || 3,
    recentHours: parseInt(v[3][0], 10) || 30,
    footer:      String(v[4][0] || '毎朝ニュース')
  };
}

function regSS_() {
  return (typeof REG_SHEET_ID !== 'undefined' && REG_SHEET_ID)
    ? SpreadsheetApp.openById(REG_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/** 毎朝の配信（トリガーで実行）。登録タブの全員に送る */
function sendDailyDigests() {
  const ss = regSS_();
  if (!ss) { Logger.log('スプレッドシートがありません。シートに紐づけるか REG_SHEET_ID を設定してください。'); return; }
  const s = getSettings_(ss);
  const sh = ss.getSheetByName(REG_TAB);
  if (!sh || sh.getLastRow() < 2) { Logger.log('登録者なし'); return; }

  // 列: 登録日時(A) 会社名(B) お名前(C) メール(D) 分野(E) 配信(F)
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  let sent = 0;
  rows.forEach(function(r) {
    const email = String(r[3] || '').trim();
    const topics = String(r[4] || '').split(',').map(function(x){ return x.trim(); }).filter(String);
    const status = String(r[5] || '有効');
    if (!email || !topics.length || status === '停止') return;
    try {
      const items = buildDigest_(topics, s);
      if (!items.length) return;
      GmailApp.sendEmail(email, s.subject, digestText_(items), {
        name: s.senderName, htmlBody: digestHtml_(items, topics, s)
      });
      sent++;
    } catch (e) { Logger.log('配信NG ' + email + ': ' + e.message); }
  });
  Logger.log('配信完了: ' + sent + '通');
}

/** 自分宛にテスト送信（届くか確認用） */
function testDigest() {
  const ss = regSS_();
  const s = getSettings_(ss);
  const me = Session.getActiveUser().getEmail();
  const topics = ['生成AI', '経営'];
  const items = buildDigest_(topics, s);
  GmailApp.sendEmail(me, '【テスト】' + s.subject, digestText_(items), {
    name: s.senderName, htmlBody: digestHtml_(items, topics, s)
  });
  Logger.log('テスト送信 → ' + me + ' / ' + items.length + '本 / 差出人:' + s.senderName);
}

/** 複数分野のニュースを集めて、重複を除いて返す */
function buildDigest_(topics, s) {
  const all = [];
  const seen = {};
  topics.forEach(function(t) {
    fetchNews_(t, s.recentHours).slice(0, s.perTopic).forEach(function(it) {
      if (seen[it.title]) return;
      seen[it.title] = 1;
      it.topic = t;
      all.push(it);
    });
  });
  return all.slice(0, DIGEST_MAX);
}

/** Googleニュース RSS から取得。直近 recentHours に絞る */
function fetchNews_(keyword, recentHours) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(keyword) + '&hl=ja&gl=JP&ceid=JP:ja';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  const cutoff = Date.now() - (recentHours || 30) * 3600 * 1000;
  try {
    const channel = XmlService.parse(res.getContentText()).getRootElement().getChild('channel');
    return channel.getChildren('item').map(function(it) {
      const pd = it.getChildText('pubDate') || '';
      return {
        title: it.getChildText('title') || '',
        url: it.getChildText('link') || '',
        source: it.getChild('source') ? it.getChild('source').getText() : '',
        ts: pd ? Date.parse(pd) : NaN
      };
    }).filter(function(it) { return isNaN(it.ts) || it.ts >= cutoff; });
  } catch (e) { return []; }
}

/** プレーンテキスト版（X投稿にも流用できる「タイトル＋URL」） */
function digestText_(items) {
  return items.map(function(it, i) { return (i + 1) + '. ' + it.title + '\n' + it.url; }).join('\n\n');
}

/** メールHTML版（テーマ別に見出しで区切り＋各記事に「Xでシェア」） */
function digestHtml_(items, topics, s) {
  let h = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">';
  let curTopic = '';
  items.forEach(function(it, i) {
    if (it.topic !== curTopic) {
      curTopic = it.topic;
      h += '<h3 style="margin:20px 0 8px;color:#2563eb;border-left:4px solid #2563eb;padding-left:8px">■ ' + curTopic + '</h3>';
    }
    h += '<div style="margin:10px 0;padding-bottom:10px;border-bottom:1px solid #eee">'
       + '<a href="' + it.url + '" style="font-size:15px;color:#1a0dab;text-decoration:none;font-weight:600">' + it.title + '</a>'
       + '<div style="margin-top:5px;display:flex;align-items:center;gap:10px">'
       + (it.source ? '<span style="color:#999;font-size:12px">' + it.source + '</span>' : '')
       + '<a href="' + xShareUrl_(it.title, it.url) + '" target="_blank" '
       + 'style="font-size:12px;font-weight:700;color:#fff;background:#111;border-radius:6px;padding:3px 10px;text-decoration:none">Xでシェア</a>'
       + '</div></div>';
  });
  h += '<p style="color:#bbb;font-size:11px;margin-top:18px">' + s.footer + '</p></div>';
  return h;
}

/** X(旧Twitter)の投稿画面を、タイトル＋URL入りで開くリンク */
function xShareUrl_(title, url) {
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
}

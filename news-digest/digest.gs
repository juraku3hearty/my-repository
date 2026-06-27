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

// 有料記事（ペイウォール）を除外する。中身が読めない媒体・表記を弾く。
// ※必要に応じて媒体名を足し引きしてください（'日経' は日経ビジネス等も含みます）
const PAYWALL_SOURCES = ['日本経済新聞','日経','東洋経済','ダイヤモンド','Bloomberg','ブルームバーグ',
  'WSJ','ウォール・ストリート','Financial Times','フィナンシャル・タイムズ','朝日新聞','毎日新聞'];
function isPaywalled_(title, source) {
  if (/有料|会員限定|有料会員|有料記事/.test(String(title || ''))) return true;
  const s = String(source || '');
  return PAYWALL_SOURCES.some(function(p){ return s.indexOf(p) >= 0; });
}

/** 設定タブを読む（無ければ作る）。会社名・件名などの“入口”。
 *  スプレッドシートが無い（単体プロジェクトでのテスト）ときはデフォルト値を返す。 */
function getSettings_(ss) {
  const def = { senderName:'毎朝ニュース', subject:'☀️ 今朝のニュース', perTopic:3, recentHours:30, footer:'毎朝ニュース', unsubUrl:'', senderEmail:'' };
  if (!ss) return def;
  let sh = ss.getSheetByName('設定');
  if (!sh) {
    sh = ss.insertSheet('設定');
    sh.getRange('A1:B7').setValues([
      ['差出人名（会社名）', '毎朝ニュース'],
      ['メールの件名',       '☀️ 今朝のニュース'],
      ['1分野あたりの本数',   3],
      ['対象とする直近時間',   30],
      ['フッター文',          '毎朝ニュース'],
      ['配信停止URL（WebAppのURLを貼る）', ''],
      ['差出人アドレス（要：Gmailで送信元認証）', '']
    ]);
    sh.getRange('A1:A7').setFontWeight('bold');
    sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 320);
    sh.getRange('A9').setValue('★ここの値を変えると配信内容が変わります（コード不要）');
  }
  if (sh.getRange('A7').getValue() === '') sh.getRange('A7').setValue('差出人アドレス（要：Gmailで送信元認証）').setFontWeight('bold');
  const v = sh.getRange('B1:B7').getValues();
  return {
    senderName:  String(v[0][0] || '毎朝ニュース'),
    subject:     String(v[1][0] || '☀️ 今朝のニュース'),
    perTopic:    parseInt(v[2][0], 10) || 3,
    recentHours: parseInt(v[3][0], 10) || 30,
    footer:      String(v[4][0] || '毎朝ニュース'),
    unsubUrl:    String(v[5][0] || ''),
    senderEmail: String(v[6][0] || '')
  };
}

/** 差出人アドレス(認証済みエイリアス)があればそこから、ダメなら通常送信にフォールバック */
function sendMail_(to, subject, text, html, s) {
  const opts = { name: s.senderName, htmlBody: html };
  if (s.senderEmail) {
    try {
      GmailApp.sendEmail(to, subject, text, { name: s.senderName, htmlBody: html, from: s.senderEmail });
      return;
    } catch (e) {
      Logger.log('差出人アドレス(' + s.senderEmail + ')で送信不可→通常送信: ' + e.message);
    }
  }
  GmailApp.sendEmail(to, subject, text, opts);
}

function regSS_() {
  return (typeof REG_SHEET_ID !== 'undefined' && REG_SHEET_ID)
    ? SpreadsheetApp.openById(REG_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/** 毎朝の配信（トリガーで実行）。登録タブの全員に送る。
 *  G列に各自の「送信履歴」を持たせ、過去に送った記事は再送しない（30時間枠の被り対策）。 */
function sendDailyDigests() {
  const ss = regSS_();
  if (!ss) { Logger.log('スプレッドシートがありません。シートに紐づけるか REG_SHEET_ID を設定してください。'); return; }
  const s = getSettings_(ss);
  const sh = ss.getSheetByName(REG_TAB);
  if (!sh || sh.getLastRow() < 2) { Logger.log('登録者なし'); return; }
  if (sh.getRange(1, 7).getValue() === '') sh.getRange(1, 7).setValue('送信履歴(自動・触らない)');

  // 列: 登録日時(A) 会社名(B) お名前(C) メール(D) 分野(E) 配信(F) 送信履歴(G)
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  let sent = 0;
  rows.forEach(function(r, idx) {
    const email = String(r[3] || '').trim();
    const topics = String(r[4] || '').split(',').map(function(x){ return x.trim(); }).filter(String);
    const status = String(r[5] || '有効');
    if (!email || !topics.length || status === '停止') return;
    try {
      const hist = parseHist_(r[6]);                                   // G列：過去に送った記事キー
      const items = buildDigest_(topics, s).filter(function(it){       // 既送の記事は除外
        return !hist[keyOf_(it.title)];
      });
      if (!items.length) return;                                       // 全部既送なら送らない
      sendMail_(email, s.subject, digestText_(items), digestHtml_(items, topics, s, email), s);
      sent++;
      sh.getRange(idx + 2, 7).setValue(mergeHist_(hist, items.map(function(it){ return keyOf_(it.title); })));
    } catch (e) { Logger.log('配信NG ' + email + ': ' + e.message); }
  });
  Logger.log('配信完了: ' + sent + '通');
}

/* ---- 再送防止：記事タイトルを短いキー化して履歴管理（人ごと・直近400件）---- */
function keyOf_(title) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(title));
  return b.slice(0, 4).map(function(x){ return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}
function parseHist_(cell) {
  const set = {};
  try { (cell ? JSON.parse(cell) : []).forEach(function(k){ set[k] = 1; }); } catch (e) {}
  return set;
}
function mergeHist_(set, newKeys) {
  const arr = Object.keys(set).concat(newKeys);
  const uniq = [], seen = {};
  for (let i = arr.length - 1; i >= 0 && uniq.length < 400; i--) {
    if (!seen[arr[i]]) { seen[arr[i]] = 1; uniq.unshift(arr[i]); }
  }
  return JSON.stringify(uniq);
}

/** 毎朝の自動配信トリガーを設定（1回実行すればOK）。
 *  4時台（4〜5時）に送る。早くしたいなら atHour(3) 等に変更。 */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'sendDailyDigests') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyDigests').timeBased().everyDays(1).atHour(4).create();
  Logger.log('毎朝4〜5時の配信を設定しました');
}

/** 自分宛にテスト送信（届くか確認用） */
function testDigest() {
  const ss = regSS_();
  const s = getSettings_(ss);
  const me = Session.getActiveUser().getEmail();
  const topics = ['生成AI', '経営'];
  const items = buildDigest_(topics, s);
  sendMail_(me, '【テスト】' + s.subject, digestText_(items), digestHtml_(items, topics, s, me), s);
  Logger.log('テスト送信 → ' + me + ' / ' + items.length + '本 / 差出人:' + s.senderName + (s.senderEmail ? ' <'+s.senderEmail+'>' : ''));
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
    }).filter(function(it) {
      return (isNaN(it.ts) || it.ts >= cutoff) && !isPaywalled_(it.title, it.source); // 有料記事を除外
    });
  } catch (e) { return []; }
}

/** プレーンテキスト版（X投稿にも流用できる「タイトル＋URL」） */
function digestText_(items) {
  return items.map(function(it, i) { return (i + 1) + '. ' + it.title + '\n' + it.url; }).join('\n\n');
}

/** メールHTML版（テーマ別に見出しで区切り＋各記事に「Xでシェア」＋配信停止） */
function digestHtml_(items, topics, s, email) {
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
  h += '<p style="color:#bbb;font-size:11px;margin-top:18px">' + s.footer;
  if (s.unsubUrl && email) {
    const sep = s.unsubUrl.indexOf('?') >= 0 ? '&' : '?';
    h += '<br><a href="' + s.unsubUrl + sep + 'unsub=' + encodeURIComponent(email) + '" style="color:#999">配信停止</a>';
  }
  h += '</p></div>';
  return h;
}

/** X(旧Twitter)の投稿画面を、タイトル＋URL入りで開くリンク */
function xShareUrl_(title, url) {
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
}

/**
 * 毎朝ニュース 配信エンジン
 * ------------------------------------------------------------------
 * 登録シート（Code.gs の REG_SHEET_ID / REG_TAB）を読み、各人の興味分野で
 * Google ニュースRSS を取得して、上位10本を毎朝メール送信する。
 *
 * ・ニュース取得＝GoogleニュースRSS（無料・APIキー不要）
 * ・要約AIは「任意の後付け」。まずはタイトル＋URLで"届くか"を確認できる。
 *
 * 【まず"届くか"テスト】
 *   この digest.gs と Code.gs を Apps Script に入れて、testDigest を実行
 *   → 自分宛に1通届けば成功（登録やデプロイ前でも試せる）
 *
 * 【本番】
 *   sendDailyDigests に「時間主導トリガー（毎朝7時など）」を設定
 */

const NEWS_PER_TOPIC = 5;   // 1分野あたり取る本数
const DIGEST_MAX = 10;      // 1通あたりの最大本数
const RECENT_HOURS = 30;    // 直近何時間のニュースに絞るか（30時間＝朝の時点で"昨日中心"。24で当日厳しめ、48で緩め）

/** 毎朝の配信（トリガーで実行） */
function sendDailyDigests() {
  const ss = (typeof REG_SHEET_ID !== 'undefined' && REG_SHEET_ID)
    ? SpreadsheetApp.openById(REG_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(REG_TAB);
  if (!sh || sh.getLastRow() < 2) { Logger.log('登録者なし'); return; }

  // 列: 登録日時(A) 会社名(B) お名前(C) メール(D) 分野(E) 配信(F)
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  let sent = 0;
  rows.forEach(function(r) {
    const email = String(r[3] || '').trim();
    const topics = String(r[4] || '').split(',').map(function(s){ return s.trim(); }).filter(String);
    const status = String(r[5] || '有効');
    if (!email || !topics.length || status === '停止') return;
    try {
      const items = buildDigest_(topics);
      if (!items.length) return;
      GmailApp.sendEmail(email, todayTitle_(), digestText_(items), { htmlBody: digestHtml_(items, topics) });
      sent++;
    } catch (e) { Logger.log('配信NG ' + email + ': ' + e.message); }
  });
  Logger.log('配信完了: ' + sent + '通');
}

/** 自分宛にテスト送信（"ほんとに届くか"の確認用） */
function testDigest() {
  const me = Session.getActiveUser().getEmail();
  const topics = ['生成AI', '経営'];
  const items = buildDigest_(topics);
  GmailApp.sendEmail(me, '【テスト】' + todayTitle_(), digestText_(items), { htmlBody: digestHtml_(items, topics) });
  Logger.log('テスト送信 → ' + me + ' / ' + items.length + '本');
}

/** 複数分野のニュースを集めて、重複を除いて上位を返す */
function buildDigest_(topics) {
  const all = [];
  const seen = {};
  topics.forEach(function(t) {
    fetchNews_(t).slice(0, NEWS_PER_TOPIC).forEach(function(it) {
      if (seen[it.title]) return;
      seen[it.title] = 1;
      it.topic = t;
      all.push(it);
    });
  });
  return all.slice(0, DIGEST_MAX);
}

/** Googleニュース RSS から記事を取得（タイトル/URL/媒体）。直近RECENT_HOURSに絞る */
function fetchNews_(keyword) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(keyword) + '&hl=ja&gl=JP&ceid=JP:ja';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  const cutoff = Date.now() - RECENT_HOURS * 3600 * 1000;
  try {
    const channel = XmlService.parse(res.getContentText()).getRootElement().getChild('channel');
    return channel.getChildren('item').map(function(it) {
      const pd = it.getChildText('pubDate') || '';
      const ts = pd ? Date.parse(pd) : NaN;
      return {
        title: it.getChildText('title') || '',
        url: it.getChildText('link') || '',
        source: it.getChild('source') ? it.getChild('source').getText() : '',
        ts: ts
      };
    }).filter(function(it) {
      return isNaN(it.ts) || it.ts >= cutoff;   // 日時不明は残す、それ以外は直近のみ
    });
  } catch (e) { return []; }
}

function todayTitle_() {
  return '☀️ 今朝のニュース（' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日') + '）';
}

/** プレーンテキスト版（X投稿にも流用できる「タイトル＋URL」） */
function digestText_(items) {
  return items.map(function(it, i) { return (i + 1) + '. ' + it.title + '\n' + it.url; }).join('\n\n');
}

/** メールのHTML版（各記事に「𝕏 シェア」ボタン付き＝ワンタップで投稿画面） */
function digestHtml_(items, topics) {
  let h = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">';
  h += '<p style="color:#888;font-size:13px">分野：' + topics.join(' / ') + '</p>';
  items.forEach(function(it, i) {
    h += '<div style="margin:14px 0;padding-bottom:12px;border-bottom:1px solid #eee">'
       + '<a href="' + it.url + '" style="font-size:15px;color:#1a0dab;text-decoration:none;font-weight:600">'
       + (i + 1) + '. ' + it.title + '</a>'
       + '<div style="margin-top:5px;display:flex;align-items:center;gap:10px">'
       + (it.source ? '<span style="color:#999;font-size:12px">' + it.source + '</span>' : '')
       + '<a href="' + xShareUrl_(it.title, it.url) + '" target="_blank" '
       + 'style="font-size:12px;font-weight:700;color:#fff;background:#111;border-radius:6px;padding:3px 10px;text-decoration:none">Xでシェア</a>'
       + '</div>'
       + '</div>';
  });
  h += '<p style="color:#bbb;font-size:11px;margin-top:18px">毎朝ニュース</p></div>';
  return h;
}

/** X(旧Twitter)の投稿画面を、タイトル＋URL入りで開くリンク */
function xShareUrl_(title, url) {
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
}

/**
 * MAYU専用：朝のニュースネタ（スタンドアロン・AIなし版）
 * ------------------------------------------------------------------
 * 「毎朝ニュース（売り物）」とは別プロジェクト。一切依存しない・混ざらない。
 *   Claude/AI活用のニュースを毎朝集めて、前回と被らない分だけ自分に送る。
 *   各記事に「Xに投稿／Threadsに投稿」ボタン（見出し＝ニュースの中身を入れて投稿画面が開く・URLなし）。
 *   一言は自分で書く。← Gemini不使用＝完全無料・429なし・タイムアウトなし。
 *
 * 【設置】1.新規GASプロジェクト 2.貼る 3.sendMyNews 手動実行で確認 4.setupTrigger で毎朝自動
 * 【毎朝】メールを開く → 気になる記事の「Xに投稿」タップ → 見出しが入ってるので一言足して投稿
 */

// ===== 設定（ここだけ触ればOK） =====
const MY_TOPICS    = ['Claude AI', 'Anthropic', '生成AI 活用', 'AI 業務効率化'];
const PER_TOPIC    = 5;               // 1分野あたり何件拾うか
const RECENT_HOURS = 30;             // 直近何時間のニュースを対象にするか
const MAX_ITEMS    = 20;              // 1通あたりの最大件数
const START_HOUR   = 4;               // 自動配信の時間帯（北海道の朝活に合わせて4時）
const MAIL_NAME    = '朝のニュースネタ';
// 有料記事（ペイウォール）を除外。中身が読めない媒体・表記を弾く（'日経'は日経ビジネス等も含む）
const PAYWALL_SOURCES = ['日本経済新聞','日経','東洋経済','ダイヤモンド','Bloomberg','ブルームバーグ',
  'WSJ','ウォール・ストリート','Financial Times','フィナンシャル・タイムズ','朝日新聞','毎日新聞'];
// ====================================

function isPaywalled_(title, source) {
  if (/有料|会員限定|有料会員|有料記事/.test(String(title || ''))) return true;
  const s = String(source || '');
  return PAYWALL_SOURCES.some(function(p){ return s.indexOf(p) >= 0; });
}

/** メイン：前回と被らない新着ニュースだけ、シェアボタン付きで自分に送る */
function sendMyNews() {
  const me = Session.getActiveUser().getEmail();
  const sent = loadSent_();
  const items = collectNews_().filter(function(it){ return it.title && !sent[keyOf_(it.title)]; }).slice(0, MAX_ITEMS);
  if (!items.length) { Logger.log('前回と被らない新着なし（時間をおいて再実行）'); return; }
  GmailApp.sendEmail(me, '☀️ 今朝のニュースネタ', newsText_(items), { name: MAIL_NAME, htmlBody: newsHtml_(items) });
  saveSent_(sent, items.map(function(it){ return keyOf_(it.title); }));
  Logger.log('送信 → ' + me + ' / ' + items.length + '本');
}

/** 毎朝 START_HOUR 時台に自動配信（1回実行すれば設定完了） */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'sendMyNews') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendMyNews').timeBased().everyDays(1).atHour(START_HOUR).create();
  Logger.log('毎朝' + START_HOUR + '時台の配信を設定しました');
}

/** 分野ごとにRSSから PER_TOPIC 件拾い、同一回の重複を除いて返す */
function collectNews_() {
  const all = [], seen = {};
  MY_TOPICS.forEach(function(t){
    fetchNews_(t).slice(0, PER_TOPIC).forEach(function(it){
      if (seen[it.title]) return;
      seen[it.title] = 1; it.topic = t; all.push(it);
    });
  });
  return all;
}

/** GoogleニュースRSSから取得（直近 RECENT_HOURS に絞る）。無料・APIキー不要 */
function fetchNews_(keyword) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(keyword) + '&hl=ja&gl=JP&ceid=JP:ja';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  const cutoff = Date.now() - RECENT_HOURS * 3600 * 1000;
  try {
    const channel = XmlService.parse(res.getContentText()).getRootElement().getChild('channel');
    return channel.getChildren('item').map(function(it){
      const pd = it.getChildText('pubDate') || '';
      return { title: it.getChildText('title') || '', url: it.getChildText('link') || '',
        source: it.getChild('source') ? it.getChild('source').getText() : '', ts: pd ? Date.parse(pd) : NaN };
    }).filter(function(it){
      return (isNaN(it.ts) || it.ts >= cutoff) && !isPaywalled_(it.title, it.source); // 有料記事を除外
    });
  } catch (e) { return []; }
}

/* ---- 前回送信と被らないための記録（直近400件のキー）---- */
function keyOf_(title) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, title);
  return b.slice(0, 4).map(function(x){ return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}
function loadSent_() {
  const raw = PropertiesService.getScriptProperties().getProperty('SENT_KEYS');
  const set = {}; (raw ? JSON.parse(raw) : []).forEach(function(k){ set[k] = 1; });
  return set;
}
function saveSent_(sentSet, newKeys) {
  const arr = Object.keys(sentSet).concat(newKeys);
  const uniq = [], seen = {};
  for (let i = arr.length - 1; i >= 0 && uniq.length < 400; i--) {
    if (!seen[arr[i]]) { seen[arr[i]] = 1; uniq.unshift(arr[i]); }
  }
  PropertiesService.getScriptProperties().setProperty('SENT_KEYS', JSON.stringify(uniq));
}
/** 記録をリセット（また被ってもOKにする） */
function clearSentHistory() {
  PropertiesService.getScriptProperties().deleteProperty('SENT_KEYS');
  Logger.log('送信履歴をリセットしました');
}

/** X／Threadsの投稿画面を、本文だけ入れて開く（URLは入れない＝ニュースの中身を投稿） */
function xDraftUrl_(text) { return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text); }
function threadsDraftUrl_(text) { return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text); }
/** 投稿の下書き本文（見出し＋媒体名の出典。URLなし。一言は自分で足す） */
function postText_(it) {
  return it.title + (it.source ? '\n（' + it.source + 'より）' : '') + '\n\n';
}

function newsText_(items) {
  return items.map(function(it, i){ return (i+1) + '. ' + it.title + '\n（記事を読む: ' + it.url + '）'; }).join('\n\n');
}

/** 各ニュースに「Xに投稿／Threadsに投稿」ボタン（見出し入り・URLなし）を付けたHTML */
function newsHtml_(items) {
  let h = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">';
  h += '<p style="color:#6b7280;font-size:13px">今朝のニュース候補（前回と被らない新着）。「Xに投稿／Threadsに投稿」を押すと<b>見出し（＝ニュースの中身・URLなし）</b>が入った投稿画面が開くので、<b>一言足して</b>投稿。記事を読む時は見出しをタップ。</p>';
  let curTopic = '';
  items.forEach(function(it){
    if (it.topic !== curTopic) {
      curTopic = it.topic;
      h += '<h3 style="margin:18px 0 6px;color:#2563eb;border-left:4px solid #2563eb;padding-left:8px;font-size:15px">■ ' + curTopic + '</h3>';
    }
    const post = postText_(it);
    h += '<div style="margin:10px 0;padding:12px;border:1px solid #eee;border-radius:10px">'
       + '<a href="' + it.url + '" style="font-size:14px;color:#1a0dab;text-decoration:none;font-weight:600">' + it.title + '</a>'
       + (it.source ? '<span style="color:#999;font-size:12px;margin-left:8px">' + it.source + '</span>' : '')
       + '<div style="margin-top:8px">'
       + '<a href="' + xDraftUrl_(post) + '" target="_blank" style="display:inline-block;font-size:13px;font-weight:700;color:#fff;background:#111;border-radius:8px;padding:7px 14px;text-decoration:none;margin-right:8px">Xに投稿 ✍️</a>'
       + '<a href="' + threadsDraftUrl_(post) + '" target="_blank" style="display:inline-block;font-size:13px;font-weight:700;color:#111;background:#fff;border:1.5px solid #111;border-radius:8px;padding:6px 13px;text-decoration:none">Threadsに投稿 🧵</a>'
       + '</div></div>';
  });
  h += '<p style="color:#bbb;font-size:11px;margin-top:16px">自分用ニュースネタ（公開ニュースのみ）</p></div>';
  return h;
}

/**
 * MAYU専用：朝のXネタ下書きツール（完全スタンドアロン）
 * ------------------------------------------------------------------
 * 「毎朝ニュース（売り物）」とは別プロジェクト。一切依存しない・混ざらない。
 *   ニュース取得 → 前回送信と被らない分だけ → Geminiが現場目線の投稿文を下書き
 *   → 自分にだけメール送信（X／Threads ワンタップ投稿リンク付き）
 *
 * 【設置（最初の1回）】
 *  1. 新規GASプロジェクトを作る（スプレッドシート不要・単体でOK）
 *  2. このファイルを貼る
 *  3. プロジェクトの設定 → スクリプトプロパティに GEMINI_API_KEY を追加
 *     （AI Studioの「課金OFF＝無料枠」キーで十分。流すのは公開情報だけ）
 *  4. sendMyDrafts を手動実行 → 自分宛に届くか確認
 *  5. setupTrigger を1回実行 → 毎朝 START_HOUR 時台に自動配信
 *
 * 【毎朝やること】メールを開く → 良い下書きの「Xに投稿／Threadsに投稿」をタップ → 一言直して投稿
 */

// ===== 設定（ここだけ触ればOK） =====
const MY_TOPICS    = ['Claude AI', 'Anthropic', '生成AI 活用', 'AI 業務効率化']; // Claude関連＋AI活用関連
const PER_TOPIC    = 5;               // 1分野あたり何件拾うか
const RECENT_HOURS = 30;             // 直近何時間のニュースを対象にするか
const DRAFT_MAX    = 20;              // 下書きを作る最大本数（4分野×5件＝最大20）
const DRAFT_MODEL  = 'gemini-2.5-flash'; // 404なら 'gemini-3.5-flash' に変更
const START_HOUR   = 4;               // 自動配信の時間帯（北海道の朝活に合わせて4時）
const MAIL_NAME    = '朝のXネタ';      // 届くメールの送信者名（自分宛なので何でもOK）
// ====================================

/** メイン：前回と被らない新着だけ、AI下書き＋投稿リンク付きで自分に送る */
function sendMyDrafts() {
  const me = Session.getActiveUser().getEmail();
  const sent = loadSent_();                                   // 前回までに送った記事（被り防止）
  const fresh = collectNews_().filter(function(it){
    return it.title && !sent[keyOf_(it.title)];               // 前回送信と被らないものだけ
  });
  const items = fresh.slice(0, DRAFT_MAX);
  if (!items.length) { Logger.log('前回と被らない新着なし（時間をおいて再実行）'); return; }

  items.forEach(function(it, i){
    if (i > 0) Utilities.sleep(1200);                          // 無料枠のレート制限(RPM)対策
    it.draft = geminiDraft_(it.title);
    it.shareUrl = shortenUrl_(it.url);                         // 長いGoogleニュースURLを短縮
  });
  GmailApp.sendEmail(me, '【Xネタ・下書き付き】☀️ 今朝のニュース', draftsText_(items),
    { name: MAIL_NAME, htmlBody: draftsHtml_(items) });
  saveSent_(sent, items.map(function(it){ return keyOf_(it.title); }));  // 今回送った分を記録
  Logger.log('送信 → ' + me + ' / ' + items.length + '本');
}

/** 毎朝 START_HOUR 時台に自動配信（1回実行すれば設定完了） */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'sendMyDrafts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendMyDrafts').timeBased().everyDays(1).atHour(START_HOUR).create();
  Logger.log('毎朝' + START_HOUR + '時台の配信を設定しました');
}

/** 分野ごとにGoogleニュースRSSから PER_TOPIC 件拾い、同一回の重複を除いて返す */
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
      return {
        title: it.getChildText('title') || '',
        url: it.getChildText('link') || '',
        source: it.getChild('source') ? it.getChild('source').getText() : '',
        ts: pd ? Date.parse(pd) : NaN
      };
    }).filter(function(it){ return isNaN(it.ts) || it.ts >= cutoff; });
  } catch (e) { return []; }
}

/* ---- 前回送信と被らないための記録（スクリプトプロパティに直近400件のキーを保存）---- */
function keyOf_(title) {  // タイトルを短いハッシュ(8桁)に。プロパティ容量を節約しつつ被り判定
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
  for (let i = arr.length - 1; i >= 0 && uniq.length < 400; i--) {   // 直近400件だけ保持
    if (!seen[arr[i]]) { seen[arr[i]] = 1; uniq.unshift(arr[i]); }
  }
  PropertiesService.getScriptProperties().setProperty('SENT_KEYS', JSON.stringify(uniq));
}
/** 記録をリセットしたい時に手動実行（また被ってもOKにする） */
function clearSentHistory() {
  PropertiesService.getScriptProperties().deleteProperty('SENT_KEYS');
  Logger.log('送信履歴をリセットしました');
}

/** Geminiで見出しから"現場目線の投稿文"を生成 */
function geminiDraft_(title) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) { Logger.log('GEMINI_API_KEY 未設定'); return ''; }
  const prompt =
    'あなたは中小企業のAI自動化を現場で手がける実務家です（整骨院スタッフ兼エンジニアで、' +
    '整骨院・弁護士事務所・酒屋などの自動化を実際に作っている）。' +
    '次のニュース見出しを受けて、SNS(X／Threads)に投稿する短いコメントを1つ書いて。' +
    '条件：日本語／120字以内／煽らない／自分の現場目線で具体的に／最後に関連ハッシュタグを2つ。' +
    'コメント本文だけを出力（前置き不要）。見出し:「' + title + '」';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + DRAFT_MODEL + ':generateContent?key=' + key;
  const payload = JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
    generationConfig:{ temperature:0.7, maxOutputTokens:200 } });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, { method:'post', contentType:'application/json', muteHttpExceptions:true, payload: payload });
      const code = res.getResponseCode();
      if (code === 200) {
        const j = JSON.parse(res.getContentText());
        return (j.candidates && j.candidates[0] && j.candidates[0].content.parts[0].text || '').trim();
      }
      if (code === 429) { Utilities.sleep(4000 * (attempt + 1)); continue; } // レート制限→待って再試行
      Logger.log('Gemini ' + code + ': ' + res.getContentText().slice(0,200)); return '';
    } catch (e) { Logger.log('Geminiエラー: ' + e.message); return ''; }
  }
  Logger.log('Gemini 429: 再試行しても上限。キー(課金)かモデルを見直し'); return '';
}

/** 長いURLを短縮（無料TinyURL）。失敗時は元のURLをそのまま返す */
function shortenUrl_(longUrl) {
  try {
    const res = UrlFetchApp.fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl), { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const s = res.getContentText().trim();
      if (s.indexOf('http') === 0) return s;
    }
  } catch (e) { Logger.log('短縮失敗: ' + e.message); }
  return longUrl;
}

/** Xの投稿画面を下書き入りで開くリンク */
function xDraftUrl_(text, url) {
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
}
/** Threadsの投稿画面を下書き入りで開くリンク（textにURLも含める） */
function threadsDraftUrl_(text, url) {
  return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text + '\n' + url);
}

function draftsText_(items) {
  return items.map(function(it, i){
    return (i+1) + '. ' + it.title + '\n【下書き】' + (it.draft || '(生成なし)') + '\n' + (it.shareUrl || it.url);
  }).join('\n\n');
}

/** 各ニュースに AI下書き＋「Xに投稿／Threadsに投稿」ボタンを付けたHTML */
function draftsHtml_(items) {
  let h = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">';
  h += '<p style="color:#6b7280;font-size:13px">今朝のXネタ候補（前回と被らない新着）。下書きの「Xに投稿／Threadsに投稿」を押すと、下書き入りで投稿画面が開きます。一言直して投稿でOK。</p>';
  items.forEach(function(it){
    const su = it.shareUrl || it.url;   // 短縮URL（無ければ元URL）
    h += '<div style="margin:14px 0;padding:12px;border:1px solid #eee;border-radius:10px">'
       + '<a href="' + it.url + '" style="font-size:14px;color:#1a0dab;text-decoration:none;font-weight:600">' + it.title + '</a>'
       + (it.source ? '<span style="color:#999;font-size:12px;margin-left:8px">' + it.source + '</span>' : '');
    if (it.draft) {
      h += '<div style="margin:8px 0;padding:10px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap">' + it.draft + '</div>'
         + '<a href="' + xDraftUrl_(it.draft, su) + '" target="_blank" '
         + 'style="display:inline-block;font-size:13px;font-weight:700;color:#fff;background:#111;border-radius:8px;padding:7px 14px;text-decoration:none;margin-right:8px">Xに投稿 ✍️</a>'
         + '<a href="' + threadsDraftUrl_(it.draft, su) + '" target="_blank" '
         + 'style="display:inline-block;font-size:13px;font-weight:700;color:#111;background:#fff;border:1.5px solid #111;border-radius:8px;padding:6px 13px;text-decoration:none">Threadsに投稿 🧵</a>';
    } else {
      // 下書きが作れなかった時（Gemini上限など）でも、タイトルでシェアできるように
      h += '<div style="margin-top:6px">'
         + '<a href="' + xDraftUrl_(it.title, su) + '" target="_blank" style="font-size:12px;font-weight:700;color:#111;margin-right:12px">Xでシェア</a>'
         + '<a href="' + threadsDraftUrl_(it.title, su) + '" target="_blank" style="font-size:12px;font-weight:700;color:#111">Threadsでシェア</a>'
         + '</div>';
    }
    h += '</div>';
  });
  h += '<p style="color:#bbb;font-size:11px;margin-top:16px">自分用Xネタ（公開ニュースのみ）</p></div>';
  return h;
}

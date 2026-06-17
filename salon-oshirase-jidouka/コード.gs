/**
 * オンラインサロン自動化スクリプト (Phase 3: readyタグ全自動投稿版)
 *
 * 変更点（元の手動版からの差分）:
 *  - processReadyVideos() を新設：Vimeoでreadyタグを付けた未処理動画を
 *    自動でCyfonsへ投稿＋LINE一斉配信する
 *  - detectCategory() を新設：動画タイトルからカテゴリを自動判定
 *    （本講座 / AI活用講座① / 自賠責保険（基礎編）/ 該当なしは「その他」）
 *  - processOnlineSalonAutomation() に processReadyVideos() を追加
 *  - 管理ページ(?admin=1)の一覧も per_page=10 → 50 に拡大
 */
const props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = "1mWE2Mq25zMtqzyKtnAkAYmujJ4-Qd1HqaGZFcQMPvOs";

function processOnlineSalonAutomation() {
  console.log("自動化処理を開始します...");
  processReadyVideos();
  createZoomMeetingsForUpcomingEvents();
  const now = new Date();
  if (now.getHours() === 20) {
    sendScheduledLineNotifications();
  }
  cleanupOldTopPageLinks();
  console.log("自動化処理が終了しました。");
}

/**
 * Vimeoで「ready」タグを付けた未処理動画を自動投稿する。
 * カテゴリは動画タイトルから自動判定し、LINE一斉配信も自動で送る。
 */
function processReadyVideos() {
  const vimeoToken = props.getProperty("VIMEO_ACCESS_TOKEN");
  const vData = JSON.parse(UrlFetchApp.fetch(
    "https://api.vimeo.com/me/videos?per_page=50&sort=date&direction=desc",
    { headers: { Authorization: `Bearer ${vimeoToken}` } }
  ).getContentText());

  const readyVideos = (vData.data || []).filter(video => {
    if (!video.tags || !video.tags.some(tag => tag.name === "ready")) return false;
    const vid = video.uri.split("/").pop();
    return !isAlreadyProcessed(vid);
  });

  if (readyVideos.length === 0) {
    console.log("readyタグ付きの未処理動画はありません。");
    return;
  }

  for (const v of readyVideos) {
    const vid = v.uri.split("/").pop();
    const category = detectCategory(v.name);
    const result = postToCyfons(vid, category, true);
    console.log(`自動投稿: ${v.name} → カテゴリ「${category}」/ ${result}`);
  }
}

/**
 * 動画タイトルから投稿カテゴリ（side_title）を自動判定する。
 * 該当キーワードが無ければ「その他」。
 */
function detectCategory(videoName) {
  const n = normalizeText(videoName);
  if (n.indexOf("自賠責") !== -1) return "自賠責保険（基礎編）";
  if (n.indexOf("ai") !== -1) return "AI活用講座①";
  if (n.indexOf("本講座") !== -1) return "本講座";
  return "その他";
}

function isAlreadyProcessed(videoId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("処理済み")
    || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("処理済み");
  const data = sheet.getDataRange().getValues();
  return data.some(row => row[0] == videoId);
}

function markAsProcessed(videoId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("処理済み")
    || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("処理済み");
  sheet.appendRow([videoId, new Date()]);
}

function normalizeText(text) {
  if (!text) return "";
  return text.replace(/[！-～]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); }).replace(/　/g, " ").toLowerCase();
}

function createZoomMeetingsForUpcomingEvents() {
  const calendar = CalendarApp.getDefaultCalendar();
  const events = calendar.getEvents(new Date(), new Date(Date.now() + 7*24*60*60*1000));
  const targetKeyword = normalizeText("#xvalueコミュニティ");
  for (const event of events) {
    if (normalizeText(event.getTitle()).indexOf(targetKeyword) !== -1 && !event.getLocation().startsWith("https://")) {
      const startTime = Utilities.formatDate(event.getStartTime(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
      const zoomUrl = createZoomMeeting(event.getTitle(), startTime);
      if (zoomUrl) event.setLocation(zoomUrl);
    }
  }
}

function sendScheduledLineNotifications() {
  const calendar = CalendarApp.getDefaultCalendar();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const events = calendar.getEvents(new Date(tomorrow.setHours(0,0,0,0)), new Date(tomorrow.setHours(23,59,59,999)));
  const targetKeyword = normalizeText("#xvalueコミュニティ");
  for (const event of events) {
    const zoomUrl = event.getLocation() || "";
    const description = event.getDescription() || "";
    if (normalizeText(event.getTitle()).indexOf(targetKeyword) !== -1 && zoomUrl.startsWith("https://") && description.indexOf("#LINE通知済み") === -1) {
      const startTime = Utilities.formatDate(event.getStartTime(), "JST", "M月d日 H:mm");
      sendLineMessage(`【明日開催のお知らせ】\n\n「${event.getTitle()}」\n開催日時：${startTime}〜\n\n明日開催です！皆さまにお会いできるのを楽しみにしています。\nZoomのURLは、会員サイトのトップページに掲載済みですので、そちらからログインしてご参加ください。\n\n▼会員サイトはこちら\nhttps://famitect.biz/members/`);
      event.setDescription(description + "\n#LINE通知済み");
    }
  }
}

function postToCyfons(videoId, sideTitle, notifyLine = true) {
  if (isAlreadyProcessed(videoId)) {
    return "この動画はすでに処理済みです。";
  }

  const id = props.getProperty("CYFONS_ID");
  const pw = props.getProperty("CYFONS_PW");
  const loginUrl = "https://famitect.biz/members/admin/index.php";

  const loginPayload = { status: "login", email: id, password: pw };
  const loginResp = UrlFetchApp.fetch(loginUrl, { method: "post", payload: loginPayload, followRedirects: false, muteHttpExceptions: true });
  console.log(`Cyfonsログイン: HTTP=${loginResp.getResponseCode()}`);
  const cookieHeader = extractCookieHeader_(loginResp);
  if (!cookieHeader) {
    return "投稿に失敗しました：Cyfonsログインのセッションが取得できません。CYFONS_ID / CYFONS_PW を確認してください。";
  }

  const vimeoToken = props.getProperty("VIMEO_ACCESS_TOKEN");
  const videoData = JSON.parse(UrlFetchApp.fetch(`https://api.vimeo.com/videos/${videoId}`, { headers: { Authorization: `Bearer ${vimeoToken}` } }).getContentText());

  const rawEmbed = videoData.embed && videoData.embed.html ? videoData.embed.html : `<iframe src="https://player.vimeo.com/video/${videoId}" width="600" height="338" frameborder="0" allowfullscreen></iframe>`;
  const embedCode = rawEmbed.replace(/width="\d+"/, 'width="600"').replace(/height="\d+"/, 'height="338"');

  const postUrl = "https://famitect.biz/members/admin/builders/tp_contents/";
  const timestamp = Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  const urlSlug = "post-" + timestamp;
  const postPayload = {
    status: "add_done",
    layout: "page",
    add_br: "0",
    side_title: sideTitle,
    side_title2: "",
    title: videoData.name,
    url: urlSlug,
    description: "",
    keyword: "",
    contents: embedCode,
    public: "1",
    public_date: "0",
    no_public_date: "",
    password: "",
    "group_id-4": "4", "group_id-5": "5", "group_id-6": "6", "group_id-8": "8", "group_id-12": "12"
  };
  const postResp = UrlFetchApp.fetch(postUrl, { method: "post", payload: postPayload, headers: cookieHeader, muteHttpExceptions: true });
  const respCode = postResp.getResponseCode();
  const respBody = postResp.getContentText() || "";
  console.log(`Cyfons投稿: HTTP=${respCode} / body先頭=${respBody.substring(0, 200)}`);

  if (respCode !== 200 && respCode !== 302) {
    return `投稿に失敗しました（HTTP ${respCode}）。管理画面を確認してください。`;
  }
  // 投稿先がログイン画面を返した＝セッション無効。HTTPは200でも実際は未投稿。
  if (respBody.indexOf('name="email"') !== -1 && respBody.indexOf('name="password"') !== -1) {
    return "投稿に失敗しました：ログイン状態が無効でした（CYFONS_ID/PWを確認）。実際にはサイトへ投稿されていません。";
  }

  updateTopPageWithArchiveLink(videoData.name, urlSlug, cookieHeader);
  markAsProcessed(videoId);
  if (notifyLine) sendLineMessage(`【事務局からのお知らせ】\n動画掲載いたしました。\n\n最新のセミナー動画はトップページからすぐ視聴できます🆕✨\nhttps://famitect.biz/members`);

  return "投稿が完了しました！会員へのLINE通知も配信済みです。";
}

function updateTopPageWithArchiveLink(videoName, urlSlug, cookieHeader) {
  const topPageUrl = "https://famitect.biz/members/admin/builders/tp_tops/index.php";
  const getResp = UrlFetchApp.fetch(topPageUrl + "?status=edit&id=1", { headers: cookieHeader, muteHttpExceptions: true });
  const html = getResp.getContentText();
  const match = html.match(/name="contents"[^>]*>([\s\S]*?)<\/textarea>/);
  if (!match) {
    console.log("トップページのcontentsが取得できませんでした");
    return;
  }
  const currentContents = match[1];
  const newLink = `<a href="https://famitect.biz/members/pg/${urlSlug}">${videoName}</a><br />`;
  const updatedContents = currentContents + newLink;
  const updatePayload = {
    title: "Xvalueコミュニティ",
    description: "トップページディスクリプション",
    keyword: "トップページキーワード",
    contents: updatedContents,
    add_br: "0",
    public: "1",
    id: "1",
    url: "index",
    status: "edit_done",
    layout: "top"
  };
  const updateResp = UrlFetchApp.fetch(topPageUrl, { method: "post", payload: updatePayload, headers: cookieHeader, muteHttpExceptions: true });
  console.log("トップページ更新レスポンス: " + updateResp.getResponseCode());
}

function cleanupOldTopPageLinks() {
  const cookieHeader = getCyfonsCookieHeader();
  const topPageUrl = "https://famitect.biz/members/admin/builders/tp_tops/index.php";
  const getResp = UrlFetchApp.fetch(topPageUrl + "?status=edit&id=1", { headers: cookieHeader, muteHttpExceptions: true });
  const html = getResp.getContentText();
  const match = html.match(/name="contents"[^>]*>([\s\S]*?)<\/textarea>/);
  if (!match) { console.log("トップページのcontentsが取得できませんでした"); return; }

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const updatedContents = match[1].replace(/<a href="https:\/\/famitect\.biz\/members\/pg\/post-(\d{14})[^"]*"[^>]*>.*?<\/a><br \/>/g, (fullMatch, ts) => {
    const year = ts.substring(0,4), month = ts.substring(4,6)-1, day = ts.substring(6,8);
    const linkDate = new Date(year, month, day);
    return linkDate < oneMonthAgo ? "" : fullMatch;
  });

  const updatePayload = {
    title: "Xvalueコミュニティ", description: "", keyword: "",
    contents: updatedContents, add_br: "0", public: "1",
    id: "1", url: "index", status: "edit_done", layout: "top"
  };
  UrlFetchApp.fetch(topPageUrl, { method: "post", payload: updatePayload, headers: cookieHeader, muteHttpExceptions: true });
  console.log("1ヶ月以上前のアーカイブリンクを削除しました。");
}

function getCyfonsCookieHeader() {
  const id = props.getProperty("CYFONS_ID");
  const pw = props.getProperty("CYFONS_PW");
  const loginUrl = "https://famitect.biz/members/admin/index.php";
  const loginPayload = { status: "login", email: id, password: pw };
  const loginResp = UrlFetchApp.fetch(loginUrl, { method: "post", payload: loginPayload, followRedirects: false, muteHttpExceptions: true });
  return extractCookieHeader_(loginResp);
}

/**
 * ログインレスポンスから Set-Cookie を取り出し、Cookie ヘッダーを組み立てる。
 * 複数Cookie・大文字小文字・カンマ連結のいずれにも耐えるよう name=value だけ抽出する。
 */
function extractCookieHeader_(loginResp) {
  const headers = loginResp.getAllHeaders();
  const raw = headers["Set-Cookie"] || headers["set-cookie"];
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  const pairs = arr.map(c => String(c).split(";")[0].trim()).filter(Boolean);
  return pairs.length ? { Cookie: pairs.join("; ") } : null;
}

/**
 * 手動診断用：Cyfonsへのログインが成立しているか確認する（投稿はしない）。
 * GASエディタでこの関数を選んで実行 → 実行ログで結果を確認。
 */
function testCyfonsLogin() {
  const id = props.getProperty("CYFONS_ID");
  const pw = props.getProperty("CYFONS_PW");
  console.log(`CYFONS_ID: ${id ? "設定あり" : "未設定"} / CYFONS_PW: ${pw ? "設定あり" : "未設定"}`);
  const loginUrl = "https://famitect.biz/members/admin/index.php";
  const loginResp = UrlFetchApp.fetch(loginUrl, { method: "post", payload: { status: "login", email: id, password: pw }, followRedirects: false, muteHttpExceptions: true });
  console.log("ログインHTTP: " + loginResp.getResponseCode());
  const cookieHeader = extractCookieHeader_(loginResp);
  console.log("取得Cookie: " + (cookieHeader ? cookieHeader.Cookie : "（取得できず）"));
  if (!cookieHeader) { console.error("❌ セッションCookieが取れません → ID/PWまたはログイン仕様を確認"); return; }

  const topPageUrl = "https://famitect.biz/members/admin/builders/tp_tops/index.php";
  const check = UrlFetchApp.fetch(topPageUrl + "?status=edit&id=1", { headers: cookieHeader, muteHttpExceptions: true });
  const html = check.getContentText() || "";
  const loggedIn = /name="contents"[^>]*>[\s\S]*?<\/textarea>/.test(html);
  console.log("管理ページ取得HTTP: " + check.getResponseCode());
  console.log(loggedIn ? "✅ ログイン成功（編集ページのcontentsを取得できた）" : "❌ ログイン失敗の可能性（contents無し。body先頭↓）");
  if (!loggedIn) console.log(html.substring(0, 300));
}

/**
 * 手動診断用：実際に1本テスト投稿して、サーバーの応答とページ生成を確認する。
 * GASエディタでこの関数を選んで実行 → 実行ログを確認。
 * ※ サイトに「【テスト投稿】〜」という記事が1件できます。確認後、Cyfons管理画面から削除してOK。
 * ※ LINE配信はしません。処理済みにも記録しません。
 */
function testCyfonsPost() {
  const videoId = "1201812458"; // 直近に処理済みになった動画でテスト

  const id = props.getProperty("CYFONS_ID");
  const pw = props.getProperty("CYFONS_PW");
  const loginResp = UrlFetchApp.fetch("https://famitect.biz/members/admin/index.php", { method: "post", payload: { status: "login", email: id, password: pw }, followRedirects: false, muteHttpExceptions: true });
  const cookieHeader = extractCookieHeader_(loginResp);
  console.log("ログイン: " + loginResp.getResponseCode() + " / Cookie: " + (cookieHeader ? "取得OK" : "なし"));
  if (!cookieHeader) return;

  const vimeoToken = props.getProperty("VIMEO_ACCESS_TOKEN");
  const vResp = UrlFetchApp.fetch(`https://api.vimeo.com/videos/${videoId}`, { headers: { Authorization: `Bearer ${vimeoToken}` }, muteHttpExceptions: true });
  console.log("Vimeo取得HTTP: " + vResp.getResponseCode());
  const videoData = JSON.parse(vResp.getContentText());
  console.log("動画名: " + videoData.name);

  const rawEmbed = videoData.embed && videoData.embed.html ? videoData.embed.html : `<iframe src="https://player.vimeo.com/video/${videoId}" width="600" height="338" frameborder="0" allowfullscreen></iframe>`;
  const embedCode = rawEmbed.replace(/width="\d+"/, 'width="600"').replace(/height="\d+"/, 'height="338"');

  const postUrl = "https://famitect.biz/members/admin/builders/tp_contents/";
  const urlSlug = "test-" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  const postPayload = {
    status: "add_done", layout: "page", add_br: "0",
    side_title: "その他", side_title2: "", title: "【テスト投稿】" + videoData.name,
    url: urlSlug, description: "", keyword: "", contents: embedCode,
    public: "1", public_date: "0", no_public_date: "", password: "",
    "group_id-4": "4", "group_id-5": "5", "group_id-6": "6", "group_id-8": "8", "group_id-12": "12"
  };
  const postResp = UrlFetchApp.fetch(postUrl, { method: "post", payload: postPayload, headers: cookieHeader, muteHttpExceptions: true });
  console.log("投稿POST HTTP: " + postResp.getResponseCode());
  console.log("投稿POST body先頭1000字:\n" + (postResp.getContentText() || "").substring(0, 1000));

  const check = UrlFetchApp.fetch("https://famitect.biz/members/pg/" + urlSlug, { headers: cookieHeader, muteHttpExceptions: true });
  console.log("作成ページ確認 HTTP: " + check.getResponseCode());
  console.log("ページに動画embedが含まれるか: " + ((check.getContentText() || "").indexOf("player.vimeo.com") !== -1));
}

function createZoomMeeting(topic, startTime) {
  const token = getZoomAccessToken();
  const payload = { topic: topic, type: 2, start_time: startTime, timezone: "Asia/Tokyo" };
  const options = { method: "post", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, payload: JSON.stringify(payload) };
  return JSON.parse(UrlFetchApp.fetch("https://api.zoom.us/v2/users/me/meetings", options).getContentText()).join_url;
}

function getZoomAccessToken() {
  const auth = Utilities.base64Encode(`${props.getProperty("ZOOM_CLIENT_ID")}:${props.getProperty("ZOOM_CLIENT_SECRET")}`);
  return JSON.parse(UrlFetchApp.fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${props.getProperty("ZOOM_ACCOUNT_ID")}`, { method: "post", headers: { Authorization: `Basic ${auth}` } }).getContentText()).access_token;
}

function sendLineMessage(text) {
  const token = props.getProperty("LINE_ACCESS_TOKEN");
  if (!token) {
    console.error("LINE配信失敗: スクリプトプロパティ LINE_ACCESS_TOKEN が未設定です。");
    return 0;
  }
  const options = {
    method: "post",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    payload: JSON.stringify({ messages: [{ type: "text", text: text }] }),
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/broadcast", options);
  const code = resp.getResponseCode();
  if (code !== 200) {
    // 401:トークン無効/期限切れ 429:月間上限到達 400:リクエスト不正 など
    console.error(`LINE配信失敗 code=${code} body=${resp.getContentText()}`);
  } else {
    console.log("LINE配信OK (broadcast)");
  }
  return code;
}

/**
 * 手動診断用：GASエディタでこの関数を選んで実行 → 実行ログで結果を確認。
 * 友だち登録した自分のLINEにテスト配信が届くかチェックする。
 */
function testLineBroadcast() {
  const code = sendLineMessage("【テスト配信】LINE配信テストです。これが届いたら設定OK。");
  console.log("testLineBroadcast 結果コード: " + code + "（200ならAPIは成功。届かない場合は『友だち登録』か『月間上限』を確認）");
}

/**
 * 手動診断用：LINE公式アカウントの月間メッセージ上限と消費数を確認する。
 * consumption が quota に達していると broadcast が 429 で弾かれて届かない。
 */
function checkLineQuota() {
  const token = props.getProperty("LINE_ACCESS_TOKEN");
  const h = { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true };
  const quota = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota", h);
  const used = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota/consumption", h);
  console.log("上限(quota): " + quota.getResponseCode() + " " + quota.getContentText());
  console.log("消費(consumption): " + used.getResponseCode() + " " + used.getContentText());
}

function doGet(e) {
  const videoId = e.parameter.v;
  const isAdmin = e.parameter.admin === "1";

  if (videoId) {
    return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;padding:20px;background:#f4f4f5;"><h2 style="color:#2563eb;">動画アーカイブの投稿</h2><p>カテゴリーを選んで投稿してください。</p><form action="'+ScriptApp.getService().getUrl()+'" method="post"><input type="hidden" name="v" value="'+videoId+'"><select name="category" style="width:100%;padding:15px;font-size:1.1em;border-radius:5px;border:1px solid #ccc;"><option value="本講座">本講座</option><option value="AI活用講座①">AI活用講座①</option><option value="自賠責保険（基礎編）">自賠責保険（基礎編）</option><option value="Facebookライブ">Facebookライブ</option><option value="コミュニティ説明会">コミュニティ説明会</option></select><label style="display:flex;align-items:center;gap:10px;margin-top:20px;font-size:1em;cursor:pointer;"><input type="checkbox" name="no_line" value="1" style="width:20px;height:20px;">LINE通知を送らない</label><button type="submit" style="width:100%;margin-top:30px;padding:20px;background:#2563eb;color:white;border:none;border-radius:5px;font-size:1.3em;font-weight:bold;cursor:pointer;">サイトへ投稿する</button></form></body></html>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (isAdmin) {
    const vimeoToken = props.getProperty("VIMEO_ACCESS_TOKEN");
    const vData = JSON.parse(UrlFetchApp.fetch("https://api.vimeo.com/me/videos?per_page=50&sort=date&direction=desc", { headers: { Authorization: `Bearer ${vimeoToken}` } }).getContentText());
    const readyVideos = vData.data.filter(video => {
      if (!video.tags.some(tag => tag.name === "ready")) return false;
      const vid = video.uri.split("/").pop();
      return !isAlreadyProcessed(vid);
    });
    if (readyVideos.length === 0) {
      return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;padding:20px;">投稿待ちの動画はありません。</body></html>');
    }
    const listHtml = readyVideos.map(v => {
      const vid = v.uri.split("/").pop();
      return '<div style="padding:15px;background:white;margin-bottom:10px;border-radius:8px;border:1px solid #e1e1e1;"><strong>'+v.name+'</strong><br><a href="'+ScriptApp.getService().getUrl()+'?v='+vid+'" target="_top" style="display:inline-block;margin-top:10px;color:#2563eb;font-weight:bold;">→ この動画を投稿する</a></div>';
    }).join("");
    return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;background:#f4f4f5;padding:20px;"><h2>投稿待ちのアーカイブ</h2>'+listHtml+'</body></html>');
  }

  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const events = calendar.getEvents(now, new Date(now.getTime() + 14*24*60*60*1000));
  const targetKeyword = normalizeText("#xvalueコミュニティ");
  let nextEvent = null;
  for (const ev of events) {
    if (normalizeText(ev.getTitle()).indexOf(targetKeyword) !== -1) { nextEvent = ev; break; }
  }

  let content;
  if (!nextEvent) {
    content = '<p style="margin:0;color:#555;">現在予定されているミーティングはありません。</p>';
  } else {
    const eventStart = nextEvent.getStartTime();
    const switchTime = new Date(eventStart);
    switchTime.setDate(switchTime.getDate() - 1);
    switchTime.setHours(18, 30, 0, 0);
    const zoomUrl = nextEvent.getLocation() || "";
    const eventDateStr = Utilities.formatDate(eventStart, "Asia/Tokyo", "M月d日 H:mm");
    if (now >= switchTime && zoomUrl.startsWith("https://")) {
      content = '<p style="margin:0;font-size:0.85em;font-weight:bold;color:#333;">次回のZoom URL</p><div style="margin-top:8px;"><a href="'+zoomUrl+'" style="color:#0369a1;text-decoration:underline;font-weight:bold;font-size:1.1em;">'+nextEvent.getTitle()+' に参加する</a></div>';
    } else {
      content = '<p style="margin:0;font-size:0.85em;font-weight:bold;color:#333;">次回開催予定</p><div style="margin-top:8px;font-size:1em;color:#1e40af;font-weight:bold;">'+eventDateStr+'　'+nextEvent.getTitle()+'</div>';
    }
  }

  return HtmlService.createHtmlOutput('<html><body style="margin:0;font-family:sans-serif;"><div style="padding:15px;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:8px;">'+content+'</div></body></html>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const notifyLine = e.parameter.no_line !== "1";
  const result = postToCyfons(e.parameter.v, e.parameter.category, notifyLine);
  const icon = result.indexOf("失敗") !== -1 ? "⚠️" : "✅";
  return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif; text-align:center; padding:50px;"><h2>'+icon+' '+result+'</h2><p>この画面は閉じて大丈夫です。</p></body></html>');
}

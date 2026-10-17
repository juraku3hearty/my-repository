/**
 * X投稿 文体ツール（全部入り）
 * このファイル1つをGASに貼れば動きます。
 *
 * 必要なスクリプトプロパティ:
 *   ANTHROPIC_API_KEY  … Claude APIキー
 *   X_SPREADSHEET_ID   … 作業用スプレッドシートのID
 *
 * ※ このファイルは build_x_dist.sh が生成します。直接編集しないでください。
 */


// ===== 10_XConfig.js =====

/**
 * 10_XConfig.js
 * X投稿 文体抽出・生成ツール  設定
 *
 * 【スクリプトプロパティ】
 *   ANTHROPIC_API_KEY   Claude APIキー
 *   X_SPREADSHEET_ID    過去ログが入っているスプレッドシートのID
 */

var X_PROPS = {
  API_KEY: 'ANTHROPIC_API_KEY',
  SPREADSHEET_ID: 'X_SPREADSHEET_ID'
};

/** このツールが作る/使うシート名 */
var X_SHEETS = {
  SETTING: 'X_設定',
  RULE: 'X_文体ルール',
  BATCH: 'X_抽出ログ',
  DRAFT: 'X_投稿案',
  WEEK: 'X_投稿案_週形式',
  FACT: 'X_一次情報',
  SAMPLE: 'X_文体サンプル',
  QSTOCK: 'X_未回答の質問',
  STRATEGY: 'X_戦略',
  PATTERN: 'X_型カタログ',
  WEEKPLAN: 'X_週の傾向',
  REACTION: 'X_反応ログ',
  ANALYTICS: 'X_反応データ',
  IDEA: 'X_企画案'
};

/**
 * 投稿の分類（紫微斗数の宮と対応）。
 * 本人が毎週、星を見て各日に割り当てる。
 */
var X_CATEGORIES = [
  { name: '拡散',       desc: '広く届けたい・外に出す',          palace: '遷移宮', layer: '潜在層' },
  { name: '共感',       desc: '気持ちに寄り添う・「わかる」',    palace: '福徳宮', layer: '潜在層' },
  { name: '人脈',       desc: 'つながり・DM誘導・相談どうぞ',    palace: '僕役宮', layer: '明確層' },
  { name: '助け',       desc: '差し出す・「一緒に考えます」',    palace: '子女宮', layer: '顕在層' },
  { name: '成果',       desc: '結果・数字・売上',                palace: '財帛宮', layer: '顕在層' },
  { name: '専門',       desc: '仕事の知識・ノウハウ',            palace: '官禄宮', layer: '準顕在層' },
  { name: '自分の言葉', desc: '自分語り・実感・経歴',            palace: '命宮',   layer: '準顕在層' },
  { name: '仕組み化',   desc: '「仕組みになる」「長く効く」',    palace: '田宅宮', layer: '顕在層' }
];

/**
 * 視点の角度。
 *
 * 素材が同じでも、どの向きから見るかで結論が変わる。
 * 文体の再現だけだと既出の焼き直しになるので、週の中で角度を散らす。
 */
var X_ANGLES = [
  '自分が過去にしていた判断を否定する。「前はこう思っていたが、違った」から入る',
  'よく言われていることの逆を、自分の経験から言う。「〜と言われるけれど、現場では逆だった」',
  'うまくいかなかった話から入る。失敗の中身を具体的に書き、そこから何を変えたかで締める',
  '数字の裏側を書く。表に出ている数字ではなく、そこに含まれない部分の話をする',
  '読者の予想を外す。「〜の話だと思われるかもしれませんが、違います」から入る',
  '別の分野の出来事を、この仕事に重ねて見せる',
  '結論を先に言い切り、そこに至るまでに捨てた選択肢を並べる',
  '相手の立場に寄り切って書く。社長ではなく、聞かれる側（スタッフ）から見た景色を書く'
];

/**
 * 週の役割の配分（既定）。X_設定の「週の役割配分」で上書きできる。
 *
 * テーマだけ散らしても、全部が「現場で見落とされている問題を指摘する投稿」に
 * なってしまうため、投稿の役割そのものを分ける。
 */
var X_DEFAULT_ROLES = [
  '実際に取り組んだ仕事:2',
  '経営者が見落としやすい問題:2',
  '失敗や試行錯誤:1',
  '社長と現場のすれ違い:1',
  '人柄や日常の気づき:1'
].join('\n');

/**
 * 着地させない結論（既定）。X_設定の「禁止する着地」で上書きできる。
 * 自己チェックでもこの語が本文にあるかを見るので、短い言い回しで書く。
 */
var X_DEFAULT_BANNED_LANDINGS = [
  '抱え込まない',
  '言語化する',
  '仕組み化すれば',
  '手段でしかない',
  '小さな業務から',
  '人ではなく仕組み'
].join('\n');

/**
 * 使わないエピソード（既定）。X_設定の「使用禁止のエピソード」で上書きできる。
 * 過去の投稿で何度も使った話。一次情報シートに残っているので、止めないと戻ってくる。
 */
var X_DEFAULT_BANNED_EPISODES = [
  '入院',
  '月末経理',
  'レジ締め',
  'LINE勤怠',
  'AI相談14件'
].join('\n');

/**
 * 題材。7本が業務改善・仕組み化の話に偏らないよう、材料の無い枠はこの順に割り振る。
 * 「これからやりたい仕事」は本人の希望なので先頭。実績ではなく「こうしたい」「こう考えている」で書く。週1本まで。
 * 「日常の気づき」は実際の場面が無いと書きにくいので最後。
 */
var X_SUBJECTS = ['これからやりたい仕事', '仕事の考え方', '実務の視点', '人柄', '日常の気づき'];

/** 業務改善・仕組み化の話は、週にこの本数まで */
var X_SYSTEM_TOPIC_MAX = 2;

/**
 * 誘導とみなす言い回し。週に1本までにする（毎回入れない）。
 * 「サービス」単体は「サービス残業」などにも当たるので入れない。
 */
var X_PROMO_WORDS = ['固定ポスト', '固定ツイート', 'プロフィール', 'プロフ見て', 'DM', 'ＤＭ',
  'ご相談ください', 'ご相談はこちら', 'お問い合わせ', '詳しくはこちら', 'LINE登録', '公式LINE'];

/**
 * X_設定の値を行ごとの配列で返す。
 * 行があれば（空でも）その値を使い、行が無ければ既定値を使う。
 */
function xSettingLines_(setting, key, defaultText) {
  var raw = (key in setting) ? setting[key] : defaultText;
  return String(raw || '').split(/\r?\n|[,、]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
}

/** 使うモデル。文体の再現が目的なので安いモデルに落とさない。 */
var X_MODEL = 'claude-opus-5-5';

/** 1回のAPI呼び出しで渡す過去ログの件数。GASの実行時間に合わせて小さめ。 */
var X_BATCH_SIZE = 8;

function xConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    apiKey: p.getProperty(X_PROPS.API_KEY) || '',
    spreadsheetId: p.getProperty(X_PROPS.SPREADSHEET_ID) || ''
  };
}

function xBook_() {
  var id = xConfig_().spreadsheetId;
  if (!id) {
    // 設定が無ければ、スクリプトがバインドされているシートを使う
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error('スクリプトプロパティ X_SPREADSHEET_ID が未設定です。');
  }
  return SpreadsheetApp.openById(id);
}

/** X_投稿案 の列。生成と自己チェックで同じものを使う。 */
var X_DRAFT_HEADERS = ['作成日時', '枠', '分類', '役割', '使った型', 'ターゲット層', 'テーマ',
  '投稿の狙い', '元になった返信・切り口', '本文', '冒頭3行', '事実確認が必要な箇所',
  '編集メモ', '自己チェック', '投稿予定日', '状態'];

/** X_投稿案 の列番号（1始まり）。列を足しても読み書きがずれないように名前で引く。 */
function xDraftCol_(name) {
  var i = X_DRAFT_HEADERS.indexOf(name);
  if (i < 0) throw new Error('X_投稿案 に「' + name + '」列の定義がありません。');
  return i + 1;
}

/** シートを取得（無ければ作る）。見出しが古い場合は列を並べ替えて直す。 */
function xSheet_(name, headers) {
  var ss = xBook_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      xWriteHeaderRow_(sh, headers);
      sh.setFrozenRows(1);
    }
    return sh;
  }
  if (headers && headers.length) xRepairHeaders_(sh, headers);
  return sh;
}

/** 見出し行を書いて体裁を整える */
function xWriteHeaderRow_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
}

/**
 * 既にあるシートの見出しが期待と違う場合に、中身を壊さず列を並べ替える。
 *
 * ツールを更新して列が増えたとき、古い行は前の列順で入っている。
 * 見出し名で対応を取り直すので、データがずれたまま検査されるのを防げる。
 * 手で足した見出し（期待に無い名前）は後ろに残す。
 *
 * @param {Sheet} sh
 * @param {Array<string>} headers 期待する見出し
 */
function xRepairHeaders_(sh, headers) {
  var width = Math.max(sh.getLastColumn(), headers.length);
  var current = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v == null ? '' : v).trim();
  });

  // 既に正しければ何もしない
  var same = true;
  for (var i = 0; i < headers.length; i++) {
    if (current[i] !== headers[i]) { same = false; break; }
  }
  if (same) return;

  // 見出しが空のシート（取り込み用など）は触らない
  var hasAnyHeader = current.some(function (v) { return v !== ''; });
  if (!hasAnyHeader) {
    xWriteHeaderRow_(sh, headers);
    sh.setFrozenRows(1);
    return;
  }

  // 期待に無い見出し（手で足した列）は末尾に回す
  var extras = [];
  for (var c = 0; c < current.length; c++) {
    if (current[c] && headers.indexOf(current[c]) < 0) extras.push(current[c]);
  }
  var target = headers.concat(extras);

  // 旧見出し名 → 旧列番号（0始まり）
  var srcOf = {};
  for (var c2 = 0; c2 < current.length; c2++) {
    if (current[c2] && !(current[c2] in srcOf)) srcOf[current[c2]] = c2;
  }

  var lastRow = sh.getLastRow();
  var body = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var moved = body.map(function (row) {
    return target.map(function (h) {
      var src = srcOf[h];
      return src === undefined ? '' : row[src];
    });
  });

  // clearContents にしているのは入力規則（ドロップダウン）を残すため
  sh.clearContents();
  xWriteHeaderRow_(sh, target);
  sh.setFrozenRows(1);
  if (moved.length) sh.getRange(2, 1, moved.length, target.length).setValues(moved);
}

// ===== 11_XClaude.js =====

/**
 * 11_XClaude.js
 * GASからClaude APIを呼ぶ（UrlFetchApp。GASはSDKが使えないので素のHTTP）
 */

var X_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Messages API を1回呼ぶ。
 * @param {Object} opt { system, userText, maxTokens, effort }
 * @return {string} 本文テキスト
 */
function xClaude_(opt) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');

  var res = xFetchWithRetry_(X_API_URL, xClaudeParams_(opt, key));
  var r = xClaudeResult_(res.getResponseCode(), res.getContentText());
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

/**
 * Messages API を「同時に」何回も呼ぶ。
 *
 * 1本ずつ順番に待つと、1回1〜2分 × 回数ぶんかかって6分制限に当たる。
 * UrlFetchApp.fetchAll は並列に投げるので、全体が「いちばん遅い1回」で終わる。
 *
 * @param {Array<Object>} reqs xClaude_ と同じ形の配列
 * @return {Array<Object>} 各要素 {ok:true, text} または {ok:false, error}
 */
function xClaudeBatch_(reqs) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');
  if (!reqs || !reqs.length) return [];

  var out = reqs.map(function () { return null; });
  var pending = reqs.map(function (_, i) { return i; });
  var waits = [2000, 4000, 8000, 16000];

  for (var attempt = 0; attempt <= waits.length && pending.length; attempt++) {
    var params = pending.map(function (i) { return xClaudeParams_(reqs[i], key); });

    var res;
    try {
      res = UrlFetchApp.fetchAll(params);
    } catch (e) {
      // 通信そのものが落ちた場合は、待って全部を投げ直す
      if (attempt < waits.length) { Utilities.sleep(waits[attempt]); continue; }
      pending.forEach(function (i) { out[i] = { ok: false, error: e.message }; });
      return out;
    }

    var retry = [];
    for (var k = 0; k < pending.length; k++) {
      var idx = pending[k];
      var code = res[k].getResponseCode();
      if (code === 429 || code >= 500) { retry.push(idx); continue; }
      out[idx] = xClaudeResult_(code, res[k].getContentText());
    }

    pending = retry;
    if (pending.length && attempt < waits.length) Utilities.sleep(waits[attempt]);
  }

  pending.forEach(function (i) {
    out[i] = { ok: false, error: 'APIが混み合っています（429/5xx）。しばらく待ってやり直してください。' };
  });
  return out;
}

/** fetch / fetchAll に渡すパラメータを作る */
function xClaudeParams_(opt, key) {
  var body = {
    model: X_MODEL,
    max_tokens: opt.maxTokens || 8000,
    // Opus 5.5 は thinking を切れない。深さは effort で調整する。
    // （budget_tokens や thinking:disabled を送ると 400 になる）
    output_config: { effort: opt.effort || 'medium' },
    messages: [{ role: 'user', content: opt.userText }]
  };
  if (opt.system) body.system = opt.system;

  return {
    url: X_API_URL,
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
}

/** 応答を {ok, text} / {ok, error} に直す */
function xClaudeResult_(code, text) {
  if (code !== 200) {
    return { ok: false, error: 'Claude API エラー (' + code + '): ' + String(text).slice(0, 500) };
  }

  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '応答をJSONとして読めませんでした: ' + String(text).slice(0, 200) };
  }

  if (json.stop_reason === 'refusal') {
    return {
      ok: false,
      error: 'リクエストが拒否されました: ' +
        ((json.stop_details && json.stop_details.explanation) || '')
    };
  }

  // thinking ブロックは既定で空。text ブロックだけ拾う。
  var out = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');

  if (json.stop_reason === 'max_tokens') {
    Logger.log('警告: max_tokens に達しました。出力が途中で切れている可能性があります。');
  }
  return { ok: true, text: out, stopReason: json.stop_reason || '' };
}

/** 429 / 5xx は待って再試行する */
function xFetchWithRetry_(url, params) {
  var waits = [2000, 4000, 8000, 16000];
  var res;
  for (var i = 0; i <= waits.length; i++) {
    res = UrlFetchApp.fetch(url, params);
    var code = res.getResponseCode();
    if (code !== 429 && code < 500) return res;
    if (i < waits.length) Utilities.sleep(waits[i]);
  }
  return res;
}

/**
 * 返答からJSONを取り出す。コードフェンスが付いていても剥がす。
 */
function xParseJson_(text) {
  var s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  var start = s.search(/[\[{]/);
  if (start > 0) s = s.slice(start);
  var lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error('AIの返答をJSONとして読めませんでした。先頭200字: ' + s.slice(0, 200));
  }
}

/**
 * 応答から投稿の配列を取り出す。
 *
 * max_tokens に達して途中で切れた場合、全体をJSONとして読むことはできないが、
 * 最後の1本を除けば完成している。全部捨てずに、読める分だけ拾う。
 *
 * @param {string} text 応答テキスト
 * @return {Array<Object>}
 */
function xParsePosts_(text) {
  try {
    var o = xParseJson_(text);
    if (o && o.posts && o.posts.length) return o.posts;
  } catch (e) {
    // 下で1本ずつ拾い直す
  }
  return xSalvagePosts_(text);
}

/** 括弧の対応が取れている部分だけを1本ずつ拾う */
function xSalvagePosts_(text) {
  var s = String(text || '');
  var out = [];
  var i = 0;

  while (i < s.length) {
    if (s.charAt(i) !== '{') { i++; continue; }

    var end = xMatchBrace_(s, i);
    if (end < 0) { i++; continue; }  // ここは切れている。内側を探す

    var chunk = s.slice(i, end + 1);
    var obj = null;
    try { obj = JSON.parse(chunk); } catch (e) { obj = null; }

    if (obj && obj.posts && obj.posts.length) {
      out = out.concat(obj.posts);
    } else if (obj && obj['本文']) {
      out.push(obj);
    }

    i = (obj ? end + 1 : i + 1);
  }

  // 同じ本文を二重に拾わないようにする
  var seen = {};
  return out.filter(function (p) {
    var key = String(p['本文'] || '').slice(0, 40);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

/** s[from] の「{」に対応する「}」の位置。無ければ -1（文字列の中の括弧は数えない） */
function xMatchBrace_(s, from) {
  var depth = 0, inStr = false, esc = false;
  for (var i = from; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ===== 12_XMap.js =====

/**
 * 12_XMap.js
 * シートの読み取り
 *
 * 2つのレイアウトに対応する。
 *   表（横）    : 1行目が見出しで、1行＝1投稿
 *   ブロック（縦）: A列にラベルが縦に繰り返し、B列以降に中身が入る
 *
 * 業者さんと共有していたシートは後者（日付／投稿日／投稿文／修正欄／空白行 の繰り返し）。
 */

/** 表（横）レイアウトのときに使う列マッピング */
var X_MAP_ITEMS = [
  ['対象シート名', '過去ログが入っているシートの名前', true, []],
  ['レイアウト', 'ブロック（縦） または 表（横）', true, []],
  ['投稿日', '表（横）のときの列名', false, ['日付', '投稿日', 'date', '日時']],
  ['雛形', '表（横）のときの列名', false, ['雛形', 'テンプレ', '投稿文', '原文', '案']],
  ['実投稿', '表（横）のときの列名', false, ['修正', '実投稿', '本文', '完成', 'post']],
  ['インプレッション', '任意', false, ['インプレ', 'impression', '表示']],
  ['いいね', '任意', false, ['いいね', 'like']],
  ['リポスト', '任意', false, ['リポスト', 'リツイート', 'repost']],
  ['返信', '任意', false, ['返信', 'リプ', 'reply']]
];

/** ブロック（縦）レイアウトのときの設定 */
var X_BLOCK_ITEMS = [
  ['ラベル列', 'ラベルが入っている列（既定 A）', 'A'],
  ['値の開始列', '1週間の最初の曜日の列（既定 B）', 'B'],
  ['値の終了列', '1週間の最後の曜日の列（既定 H）', 'H'],
  ['ブロックの先頭ラベル', 'ここが来たら次の投稿とみなす（既定 日付）', '日付'],
  ['雛形のラベル', '業者さんの原文が入っているラベル（既定 投稿文）', '投稿文'],
  ['実投稿のラベル', '書き換え後が入っているラベル（既定 修正欄）', '修正欄'],
  ['投稿日のラベル', '任意（既定 投稿日）', '投稿日'],
  ['無視するラベル', '読み飛ばすラベル。カンマ区切り', '空白行']
];

/** 自由記述の設定 */
var X_TEXT_ITEMS = [
  ['戦略シート名', '発信設計のシート名（カンマ区切り）。丸ごと読み込みます', true],
  ['一次情報シート名', 'インタビュー・年表など、実際の出来事が書いてあるシート（カンマ区切り）', false],
  ['文体サンプルシート名', 'サンプル投稿・固定ポストなど、完成した投稿があるシート（カンマ区切り）', false],
  ['これからのコンセプト', '戦略シートがあれば空でも可。補足したいことがあれば', false],
  ['アカウント紹介', 'プロフィール文など。読者像の判断に使います', false],
  ['投稿の方向性', '業者さんのシートに分類があればそれを貼る（改行区切り）', false],
  ['扱わないこと', '書かないテーマがあれば（改行区切り）', false],
  ['1本の文字数の目安', '空なら指定なし。長さを変えたいときだけ数字を入れる（例: 500）', false],
  ['今週あったこと', 'スクリプトエディタから実行するとき用。相談で言われた言葉・詰まったこと・作ったものを1行', false],
  ['今週のテーマ', 'スクリプトエディタから実行するとき用。テーマがあれば（改行区切り）', false],
  ['企画シート名', '外部ライターの企画シート（カンマ区切り）。テーマ選びと切り口の作り方だけを参考にする', false],
  ['過去の投稿・経歴を材料にする', '「はい」で過去の投稿本文と経歴・年表を渡す。それ以外は渡さない（今週の返信を優先）', false, 'いいえ'],
  ['返信を読む日数', '直近何日ぶんの返信・引用を材料にするか', false, '7'],
  ['週の役割配分', '「役割:本数」を改行区切りで。目安なので、材料が無い役割は飛ばす', false, X_DEFAULT_ROLES],
  ['材料が無い枠', '「題材を変えて作る」…考え方・実務・人柄・日常・これから の題材で叩き台を作る（実体験は入れない。方向性シートは軸の確認だけ）／「空ける」…空けて不足を報告する', false, '題材を変えて作る'],
  ['禁止する着地', 'この結論で締めない（改行区切り）。自己チェックでも検出する', false, X_DEFAULT_BANNED_LANDINGS],
  ['使用禁止のエピソード', '今は使わない話（改行区切り）。また使いたくなったら消してください', false, X_DEFAULT_BANNED_EPISODES]
];

/**
 * 初期セットアップ。X_設定シートを作り、推測で埋める。
 */
function xSetup() {
  var ss = xBook_();
  var sh = xSheet_(X_SHEETS.SETTING, ['項目', '値', '説明']);
  var current = xReadSetting_();

  var own = [X_SHEETS.SETTING, X_SHEETS.RULE, X_SHEETS.BATCH, X_SHEETS.DRAFT];
  var candidates = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return own.indexOf(n) < 0; });

  var targetName = current['対象シート名'] || candidates[0] || '';
  var headers = targetName ? xHeadersOf_(targetName) : [];
  var guessedLayout = current['レイアウト'] || (targetName ? xGuessLayout_(targetName) : 'ブロック（縦）');

  var rows = X_MAP_ITEMS.map(function (item) {
    var key = item[0], desc = item[1], required = item[2], hints = item[3];
    var val = current[key] || '';
    if (!val) {
      if (key === '対象シート名') val = targetName;
      else if (key === 'レイアウト') val = guessedLayout;
      else val = xGuessHeader_(headers, hints);
    }
    return [key, val, (required ? '【必須】' : '【任意】') + desc];
  });

  var blockRows = X_BLOCK_ITEMS.map(function (item) {
    return ['▼' + item[0], current['▼' + item[0]] || item[2], '【ブロック（縦）用】' + item[1]];
  });

  var textRows = X_TEXT_ITEMS.map(function (item) {
    // 行が既にあれば（空でも）本人の値を残す。初めて作る行だけ既定値を入れる。
    var val = (item[0] in current) ? current[item[0]] : (item[3] || '');
    return [item[0], val, (item[2] ? '【必須】' : '【任意】') + item[1]];
  });

  var all = rows.concat([['', '', '']], blockRows, [['', '', '']], textRows);

  // 項目が増えると下の「参考」が残って二重に見えるので、先に消す
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 3)).clearContent();
  }
  sh.getRange(2, 1, all.length, 3).setValues(all);
  sh.getRange(2, 2, all.length, 1).setBackground('#fff8e1').setWrap(true);
  sh.setColumnWidth(2, 420);
  sh.setColumnWidth(3, 380);

  // 参考情報
  var info = [['', '', ''], ['── 参考 ──', '', '']];
  info.push(['このブックのシート', candidates.join(' / '), '']);
  if (headers.length) info.push(['1行目の内容', headers.join(' / '), '']);
  if (targetName) info.push(['A列の先頭20件', xColumnPeek_(targetName, 1, 20).join(' / '), '']);
  sh.getRange(all.length + 3, 1, info.length, 3).setValues(info);

  Logger.log('X_設定を作成/更新しました: ' + ss.getUrl());
  xToast_('X_設定シートを作りました。値を確認してください。');
}

/** レイアウトを推測する */
function xGuessLayout_(sheetName) {
  var peek = xColumnPeek_(sheetName, 1, 30).join('\n');
  // A列に同じラベルが繰り返し出てくるならブロック（縦）
  var hits = (peek.match(/投稿文|修正欄|投稿日/g) || []).length;
  return hits >= 3 ? 'ブロック（縦）' : '表（横）';
}

/** 指定列の先頭n件を覗く */
function xColumnPeek_(sheetName, col, n) {
  var sh = xBook_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() === 0) return [];
  var last = Math.min(n, sh.getLastRow());
  return sh.getRange(1, col, last, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v; });
}

function xHeadersOf_(sheetName) {
  var sh = xBook_().getSheetByName(sheetName);
  if (!sh || sh.getLastColumn() === 0) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v).trim(); });
}

function xGuessHeader_(headers, hints) {
  for (var h = 0; h < hints.length; h++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] && headers[i].toLowerCase().indexOf(hints[h].toLowerCase()) >= 0) {
        return headers[i];
      }
    }
  }
  return '';
}

function xReadSetting_() {
  var sh = xBook_().getSheetByName(X_SHEETS.SETTING);
  var out = {};
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    if (k && k.indexOf('──') < 0) out[k] = String(values[r][1]).trim();
  }
  return out;
}

/** 列名（A, B, …）を1始まりの番号に */
function xColNum_(letter) {
  var s = String(letter || '').trim().toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n || 1;
}

/**
 * 過去ログを読む。レイアウトに応じて切り替える。
 * @return {Array<Object>} [{ row, 投稿日, 雛形, 実投稿, ... }]
 */
function xReadLog_() {
  var map = xReadSetting_();
  var sheetName = map['対象シート名'];
  if (!sheetName) throw new Error('X_設定の「対象シート名」が空です。xSetup() を実行してください。');

  var sh = xBook_().getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);

  return (map['レイアウト'] === '表（横）')
    ? xReadTable_(sh, map)
    : xReadBlocks_(sh, map);
}

/** これ以上の長さの値が入っていたら「本文の行」とみなす */
var X_CONTENT_MIN_LEN = 80;

/**
 * ブロック（縦）レイアウトを読む。
 *
 * A列にラベル、B〜H列が1週間分（1列＝1日＝1投稿）。
 *
 * 実際のシートではブロックによってラベルが食い違っている
 * （本文の行が「投稿文」だったり「日付」だったりする）。
 * そのためラベルだけに頼らず、「値が長文ならそれは本文」と判定する。
 */
function xReadBlocks_(sh, map) {
  var labelCol = xColNum_(map['▼ラベル列'] || 'A');
  var colFrom  = xColNum_(map['▼値の開始列'] || 'B');
  var colTo    = xColNum_(map['▼値の終了列'] || 'H');
  var startLabel = (map['▼ブロックの先頭ラベル'] || '日付').trim();
  var tmplLabel  = (map['▼雛形のラベル'] || '投稿文').trim();
  var postLabel  = (map['▼実投稿のラベル'] || '修正欄').trim();
  var dateLabel  = (map['▼投稿日のラベル'] || '投稿日').trim();
  var ignore = String(map['▼無視するラベル'] || '空白行')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < colFrom) return [];
  if (colTo > lastCol) colTo = lastCol;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var width = colTo - colFrom + 1;

  var rows = [];
  var cur = null;
  var curField = null;

  function newBlock(r) {
    var o = { row: r + 1 };
    ['見出し', '投稿日', '雛形', '実投稿'].forEach(function (f) {
      o[f] = [];
      for (var i = 0; i < width; i++) o[f].push('');
    });
    return o;
  }

  /** その行の値セルを配列で返す */
  function cellsOf(r) {
    var out = [];
    for (var i = 0; i < width; i++) {
      var raw = values[r][colFrom - 1 + i];
      out.push((raw === null || raw === undefined) ? '' : String(raw).trim());
    }
    return out;
  }

  function maxLenOf(cells) {
    var m = 0;
    cells.forEach(function (v) { if (v.length > m) m = v.length; });
    return m;
  }

  function put(block, field, cells) {
    for (var i = 0; i < width; i++) {
      if (!cells[i]) continue;
      block[field][i] = block[field][i] ? (block[field][i] + '\n' + cells[i]) : cells[i];
    }
  }

  function filled(block, field) {
    return block[field].some(function (v) { return String(v).trim(); });
  }

  function flush() {
    if (!cur) return;
    for (var i = 0; i < width; i++) {
      var t = String(cur['雛形'][i] || '').trim();
      var p = String(cur['実投稿'][i] || '').trim();
      if (!t && !p) continue;
      rows.push({
        row: cur.row,
        col: colFrom + i,
        '見出し': cur['見出し'][i],
        '投稿日': cur['投稿日'][i] || cur['見出し'][i],
        '雛形': t,
        '実投稿': p,
        'インプレッション': '', 'いいね': '', 'リポスト': '', '返信': ''
      });
    }
    cur = null;
    curField = null;
  }

  for (var r = 0; r < lastRow; r++) {
    var label = String(values[r][labelCol - 1] || '').trim();
    var cells = cellsOf(r);
    var maxLen = maxLenOf(cells);
    var hasValue = maxLen > 0;

    if (label && ignore.indexOf(label) >= 0) { curField = null; continue; }

    // ラベルが無い行は、直前のラベルの続きとして同じ列に足す
    if (!label) {
      if (cur && curField && hasValue) put(cur, curField, cells);
      continue;
    }

    var isLongRow = maxLen >= X_CONTENT_MIN_LEN;
    var field = null;
    var boundary = false;

    if (label === tmplLabel)      field = '雛形';
    else if (label === postLabel) field = '実投稿';
    else if (label === dateLabel) field = isLongRow ? null : '投稿日';
    else if (label === startLabel) {
      // 「日付」でも中身が長文なら、ラベルの付け間違い。本文として扱う
      if (isLongRow) field = null;
      else { boundary = true; field = '見出し'; }
    } else {
      // 想定外のラベル。長文なら本文、そうでなければ読み飛ばす
      if (!isLongRow) { curField = null; continue; }
      field = null;
    }

    // ラベルから決まらなかった長文行は、雛形→実投稿の順に入れる
    if (field === null) {
      if (!cur) cur = newBlock(r);
      field = filled(cur, '雛形') ? '実投稿' : '雛形';
    }

    if (boundary) { flush(); cur = newBlock(r); }
    if (!cur) cur = newBlock(r);

    // 同じ項目が二度出てきたら、そこから次のブロック
    if (!boundary && filled(cur, field)) { flush(); cur = newBlock(r); }

    curField = field;
    if (hasValue) put(cur, field, cells);
  }
  flush();
  return rows;
}

/**
 * A列にどんなラベルが並んでいるかを一覧にする（診断用）。
 */
function xPreviewLabels() {
  var map = xReadSetting_();
  var sh = xBook_().getSheetByName(map['対象シート名']);
  if (!sh) throw new Error('対象シートが見つかりません。');

  var labelCol = xColNum_(map['▼ラベル列'] || 'A');
  var colFrom  = xColNum_(map['▼値の開始列'] || 'B');
  var colTo    = Math.min(xColNum_(map['▼値の終了列'] || 'H'), sh.getLastColumn());
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();

  var counts = {};
  for (var r = 0; r < values.length; r++) {
    var label = String(values[r][labelCol - 1] || '').trim();
    if (!label) continue;
    var maxLen = 0;
    for (var c = colFrom - 1; c < colTo; c++) {
      var v = String(values[r][c] || '').trim();
      if (v.length > maxLen) maxLen = v.length;
    }
    var key = label + (maxLen >= X_CONTENT_MIN_LEN ? '（長文あり）' : '');
    counts[key] = (counts[key] || 0) + 1;
  }

  Logger.log('--- A列のラベル別件数 ---');
  Object.keys(counts).forEach(function (k) { Logger.log(k + ' : ' + counts[k] + '行'); });
  xToast_('ラベル一覧をログに出しました。');
  return counts;
}

/** 表（横）レイアウトを読む */
function xReadTable_(sh, map) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (v) { return String(v).trim(); });
  var keys = ['投稿日', '雛形', '実投稿', 'インプレッション', 'いいね', 'リポスト', '返信'];
  var idx = {};
  keys.forEach(function (k) { idx[k] = map[k] ? headers.indexOf(map[k]) : -1; });

  if (idx['雛形'] < 0 && idx['実投稿'] < 0) {
    throw new Error('X_設定の「雛形」「実投稿」の列名が見出しと一致していません。\n' +
      '見出し: ' + headers.join(' / '));
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = { row: r + 1 };
    keys.forEach(function (k) { o[k] = (idx[k] >= 0) ? values[r][idx[k]] : ''; });
    if (!String(o['雛形']).trim() && !String(o['実投稿']).trim()) continue;
    rows.push(o);
  }
  return rows;
}

/**
 * 読み取り結果を確認する（実行してログを見る）。
 */
function xPreviewLog() {
  var rows = xReadLog_();
  Logger.log('読み取れた件数: ' + rows.length);
  rows.slice(0, 3).forEach(function (r, i) {
    Logger.log('--- ' + (i + 1) + ' (行' + r.row + (r.col ? ' 列' + r.col : '') + ') ---');
    Logger.log('投稿日: ' + r['投稿日']);
    Logger.log('雛形  : ' + String(r['雛形']).slice(0, 120));
    Logger.log('実投稿: ' + String(r['実投稿']).slice(0, 120));
  });
  xToast_(rows.length + '件を読み取りました。ログを確認してください。');
  return rows.length;
}

// ===== 13_XExtract.js =====

/**
 * 13_XExtract.js
 * 文体ルールの抽出
 *
 * 雛形（業者の原文）と実投稿（書き換え後）の差分から、文体のルールを取り出す。
 * 一番の狙いは「業者が書いたのに、あなたが消した言葉」＝禁止語リスト。
 *
 * GASの実行時間制限があるので、途中で止まっても続きから再開できるようにしてある。
 * 「X 文体抽出 > 抽出を実行」を、完了と出るまで何度か押せばよい。
 */

var X_PROGRESS_KEY = 'X_EXTRACT_CURSOR';
var X_TIME_LIMIT_MS = 4.5 * 60 * 1000; // GASの6分制限に対する安全マージン

/**
 * 抽出を実行する（途中から再開可）。
 */
function xExtractStyle() {
  var started = Date.now();
  var all = xReadLog_();
  if (!all.length) throw new Error('過去ログが読めませんでした。X_設定を確認してください。');

  // 雛形と実投稿が両方そろっている行だけが「書き換えの差分」になる。
  // 修正欄がまばらなので、十分な数が無ければ差分抽出はあきらめ、
  // 投稿文そのものから文体を読む方式に切り替える。
  var pairs = all.filter(function (r) {
    return String(r['雛形'] || '').trim() && String(r['実投稿'] || '').trim();
  });
  var useDiff = pairs.length >= 5;
  var rows = useDiff ? pairs : all;

  Logger.log(useDiff
    ? ('差分あり ' + pairs.length + '件で抽出します（全' + all.length + '件中）')
    : ('書き換えの差分が ' + pairs.length + '件しかないため、投稿文そのものから文体を読みます（全' + all.length + '件）'));

  var logSh = xSheet_(X_SHEETS.BATCH,
    ['バッチ', '対象行', '抽出結果(JSON)', '実行日時']);

  var p = PropertiesService.getScriptProperties();
  var cursor = Number(p.getProperty(X_PROGRESS_KEY) || 0);

  if (cursor === 0) {
    // 最初から始めるときは前回の結果を消す
    if (logSh.getLastRow() > 1) {
      logSh.getRange(2, 1, logSh.getLastRow() - 1, logSh.getLastColumn()).clearContent();
    }
  }

  var total = rows.length;
  var done = 0;

  while (cursor < total) {
    if (Date.now() - started > X_TIME_LIMIT_MS) {
      p.setProperty(X_PROGRESS_KEY, String(cursor));
      var msg = '時間切れで中断しました。' + cursor + ' / ' + total + ' 件まで完了。\n' +
                'もう一度「抽出を実行」を押すと続きから再開します。';
      Logger.log(msg);
      xToast_(msg);
      return;
    }

    var batch = rows.slice(cursor, cursor + X_BATCH_SIZE);
    var result = null;

    try {
      result = xExtractBatch_(batch, useDiff);
    } catch (err1) {
      Logger.log('バッチ失敗（1回目）: ' + err1.message);
      // 件数を半分にして再試行する（出力が長すぎたケースの救済）
      try {
        var half = batch.slice(0, Math.max(1, Math.ceil(batch.length / 2)));
        result = xExtractBatch_(half, useDiff);
        batch = half;
        Logger.log('半分にして再試行し、成功しました（' + half.length + '件）');
      } catch (err2) {
        Logger.log('バッチ失敗（2回目）。この分は飛ばして続けます: ' + err2.message);
        logSh.appendRow([
          Math.floor(cursor / X_BATCH_SIZE) + 1,
          batch[0].row + '〜' + batch[batch.length - 1].row,
          '',
          '失敗のため省略 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
        ]);
        cursor += batch.length;
        p.setProperty(X_PROGRESS_KEY, String(cursor));
        continue;
      }
    }

    logSh.appendRow([
      Math.floor(cursor / X_BATCH_SIZE) + 1,
      batch[0].row + '〜' + batch[batch.length - 1].row,
      JSON.stringify(result),
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
    ]);

    cursor += batch.length;
    done += batch.length;
    p.setProperty(X_PROGRESS_KEY, String(cursor));
  }

  // 全バッチ完了 → 統合
  p.deleteProperty(X_PROGRESS_KEY);
  xMergeRules_();
  xToast_('抽出が完了しました（' + total + '件）。X_文体ルール を確認してください。');
}

/** 進捗をリセットして最初からやり直す */
function xResetExtract() {
  PropertiesService.getScriptProperties().deleteProperty(X_PROGRESS_KEY);
  xToast_('進捗をリセットしました。次回は最初から実行します。');
}

/**
 * 1バッチ分を抽出する。
 * @param {Array} batch
 * @param {boolean} useDiff 雛形と実投稿の差分が取れるか
 */
function xExtractBatch_(batch, useDiff) {
  var items = batch.map(function (r, i) {
    if (useDiff) {
      return [
        '--- ' + (i + 1) + ' (行' + r.row + ') ---',
        '【雛形】',
        String(r['雛形'] || '(なし)'),
        '【実投稿】',
        String(r['実投稿'] || '(なし)')
      ].join('\n');
    }
    return [
      '--- ' + (i + 1) + ' (行' + r.row + ') ---',
      String(r['実投稿'] || r['雛形'] || '')
    ].join('\n');
  }).join('\n\n');

  var system = useDiff ? [
    'あなたは日本語の文体を分析する専門家です。',
    '与えられるのは、外部ライターが書いた「雛形」と、本人が書き直した「実投稿」の対です。',
    '',
    '目的は、本人の文体を再現できるルールを取り出すことです。',
    '特に重要なのは「雛形にあったのに実投稿で消された言葉」です。',
    'それは本人が「自分の言葉ではない」と判断した語なので、禁止語として扱います。',
    '',
    '文体に加えて、次の2つも記録してください。',
    '1. 実投稿が扱っているテーマと、繰り返し出てくる主張',
    '   （この書き手の発信の軸が一貫しているかを見るため）',
    '2. 雛形の側が提案していたテーマと、雛形の構成の型',
    '   （雛形はプロのライターが作った企画案です。文章は本人のものに置き換えますが、',
    '    テーマの出し方と構成の型は、それ自体が使える資産なので残します）',
    '',
    '推測で一般的な文章術を書かないでください。与えられた実例から読み取れることだけを書いてください。',
    '',
    '【出力量の制限】必ず守ってください。超えると読み取れなくなります。',
    '・各配列は最大15件まで。多いときは、繰り返し出てきたものだけを残す',
    '・1件は30字以内。語か短い言い回しだけを書く',
    '・かっこ書きの説明を付けない',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n') : [
    'あなたは日本語の文体を分析する専門家です。',
    '与えられるのは、ある書き手が実際に出した投稿です。',
    '',
    '目的は、この書き手の文体を再現できるルールを取り出すことです。',
    'この書き手が使っていない種類の語（一般的なSNS文章によく出るが、ここには出てこない語）に',
    '気づいたら、それも「使わない語」として記録してください。',
    '',
    '文体に加えて、次の2つも記録してください。',
    '1. 扱っているテーマと、繰り返し出てくる主張',
    '2. 構成の型（どういう順で組み立てているか）',
    '',
    '推測で一般的な文章術を書かないでください。与えられた実例から読み取れることだけを書いてください。',
    '',
    '【出力量の制限】必ず守ってください。超えると読み取れなくなります。',
    '・各配列は最大15件まで。多いときは、繰り返し出てきたものだけを残す',
    '・1件は30字以内。語か短い言い回しだけを書く',
    '・かっこ書きの説明を付けない',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    useDiff ? '以下の対を分析し、JSONで返してください。' : '以下の投稿を分析し、JSONで返してください。',
    '',
    items,
    '',
    '--- 出力形式 ---',
    '{',
    (useDiff ? '  "消した語": ["雛形にあったが実投稿で消された語・言い回し"],'
             : '  "消した語": ["この書き手が使っていない、不自然になる語"],'),
    (useDiff ? '  "足した語": ["雛形になく実投稿で足された語・言い回し"],'
             : '  "足した語": ["この書き手が特徴的に使う語"],'),
    '  "文の長さ": "1文の長さの傾向を一言で",',
    '  "改行": "改行と空行の入れ方の傾向を一言で",',
    '  "語尾": ["よく使われている語尾"],',
    '  "一人称": "使われている一人称",',
    '  "冒頭": ["冒頭の入り方のパターン"],',
    '  "CTA": ["締め・誘導の言い回し"],',
    '  "テーマ": ["実投稿で扱われているテーマ"],',
    '  "雛形のテーマ": ["雛形の側で提案されていたテーマ・切り口"],',
    '  "雛形の構成": ["雛形の骨組み。どういう順で組み立てているか"],',
    '  "繰り返している主張": ["何度も出てくる考え方・言い切り"],',
    '  "具体例の出し方": ["どういう種類の例を出しているか"],',
    '  "その他": ["上に入らない特徴"]',
    '}'
  ].join('\n');

  var text = xClaude_({ system: system, userText: user, maxTokens: 8000, effort: 'medium' });
  return xParseJson_(text);
}

/** 全バッチの結果を1つの文体ルールにまとめる */
function xMergeRules_() {
  var logSh = xSheet_(X_SHEETS.BATCH);
  var values = logSh.getDataRange().getValues();
  var observations = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r][2]) observations.push(values[r][2]);
  }
  if (!observations.length) throw new Error('抽出ログが空です。先に抽出を実行してください。');

  var system = [
    'あなたは日本語の文体を分析する専門家です。',
    '複数バッチの観察結果を統合し、1つの「文体ルール」にまとめてください。',
    '',
    '統合のルール:',
    '- 複数のバッチで繰り返し出てきたものを優先する（1回しか出ていないものは採用しない）',
    '- 似た表現はまとめる',
    '- 一般的な文章術は書かない。観察から読み取れたことだけを書く',
    '',
    '【出力量の制限】各配列は最大25件、1件30字以内。かっこ書きの説明を付けない。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    '以下は、同じ書き手の投稿を分割して分析した結果です。統合してください。',
    '',
    observations.join('\n'),
    '',
    '--- 出力形式 ---',
    '{',
    '  "禁止語": ["使わない語。繰り返し消されていたもの"],',
    '  "採用語": ["よく使う語・言い回し"],',
    '  "文の長さ": "",',
    '  "改行": "",',
    '  "語尾": [],',
    '  "一人称": "",',
    '  "冒頭パターン": [],',
    '  "CTAパターン": [],',
    '  "よく書くテーマ": ["実投稿で繰り返し扱っているテーマ"],',
    '  "雛形にあったテーマ": ["雛形が提案していたテーマの一覧。企画の引き出しとして残す"],',
    '  "構成の型": ["雛形で繰り返し使われていた組み立て方。型として残す"],',
    '  "繰り返している主張": ["この書き手が何度も言っていること"],',
    '  "具体例の出し方": [],',
    '  "守るべきこと": ["生成時に必ず守るルール"],',
    '  "やってはいけないこと": ["生成時に避けること"]',
    '}'
  ].join('\n');

  var merged = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 16000, effort: 'high'
  }));

  xWriteRules_(merged);
  return merged;
}

/** 文体ルールをシートに書く（手で直せる形） */
function xWriteRules_(rule) {
  var sh = xSheet_(X_SHEETS.RULE, ['項目', '内容', 'メモ（手で直してください）']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var rows = [];
  Object.keys(rule).forEach(function (k) {
    var v = rule[k];
    rows.push([k, Array.isArray(v) ? v.join('\n') : String(v), '']);
  });

  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.setColumnWidth(2, 520);
  sh.getRange(2, 2, rows.length, 1).setWrap(true);
}

/** 文体ルールをシートから読む（手で直した内容が反映される） */
function xReadRules_() {
  var sh = xBook_().getSheetByName(X_SHEETS.RULE);
  if (!sh || sh.getLastRow() < 2) {
    throw new Error('X_文体ルール がありません。先に「抽出を実行」してください。');
  }
  var values = sh.getDataRange().getValues();
  var lines = [];
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    var v = String(values[r][1]).trim();
    var memo = String(values[r][2]).trim();
    if (!k) continue;
    lines.push('【' + k + '】');
    if (v) lines.push(v);
    if (memo) lines.push('（補足）' + memo);
    lines.push('');
  }
  return lines.join('\n');
}

function xToast_(msg) {
  try {
    var ss = SpreadsheetApp.getActive();
    if (ss) ss.toast(msg, 'X 文体抽出', 10);
  } catch (e) { /* UIが無い実行経路では無視 */ }
}


/**
 * 使わなかった雛形を一覧にする。
 *
 * 雛形はあるのに実投稿が空の行＝そのとき投稿しなかった企画。
 * 業者さんに依頼して作ってもらったものなので、まだ使える在庫として扱う。
 */
function xListUnusedTemplates() {
  var rows = xReadLog_();
  var unused = rows.filter(function (r) {
    return String(r['雛形'] || '').trim() && !String(r['実投稿'] || '').trim();
  });

  var sh = xSheet_('X_企画ストック', ['元の行', '元の列', '日付', '雛形（未使用）', '使うか']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  if (!unused.length) {
    xToast_('未使用の雛形はありませんでした（すべて投稿済みです）。');
    return 0;
  }

  var out = unused.map(function (r) {
    return [r.row, r.col || '', r['投稿日'] || r['見出し'] || '', String(r['雛形']), ''];
  });
  sh.getRange(2, 1, out.length, 5).setValues(out);
  sh.setColumnWidth(4, 520);
  sh.getRange(2, 4, out.length, 1).setWrap(true);

  xToast_('未使用の雛形が ' + unused.length + '本 ありました。X_企画ストック を見てください。');
  return unused.length;
}

// ===== 14_XGenerate.js =====

/**
 * 14_XGenerate.js
 * 投稿案の生成
 *
 * コンセプト × テーマ × 文体ルール → 投稿案。
 * 文体ルールを先に適用するので、書き直す前提ではなく、そのまま出せる形を狙う。
 */

/**
 * メニューから呼ぶ。テーマと本数を聞いて生成する。
 */
function xGeneratePosts() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var themes = '';
  var count = 7;

  if (ui) {
    var r1 = ui.prompt(
      '今週の投稿案を作ります',
      'テーマがあれば、改行またはカンマ区切りで入れてください。\n' +
      '空のままOKを押すと、コンセプトからこちらで提案します。',
      ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    themes = r1.getResponseText();

    var r2 = ui.prompt('本数', '何本つくりますか（既定 7）', ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    var n = parseInt(r2.getResponseText(), 10);
    if (!isNaN(n) && n > 0 && n <= 14) count = n;

    // 今週あったことを1行だけ。ここが新しい視点のいちばんの素になる。
    var r3 = ui.prompt(
      '今週あったこと（1行でOK・空でも進みます）',
      '相談で言われた言葉、詰まったこと、作ったもの、現場で見たこと。\n' +
      'ひとつだけ、短く。きれいに書かなくて大丈夫です。\n' +
      '例：「スタッフに聞かれた回数を数えたら1日12回だった」',
      ui.ButtonSet.OK_CANCEL);
    if (r3.getSelectedButton() === ui.Button.OK) {
      var note = String(r3.getResponseText() || '').trim();
      if (note) xSaveThisWeekNote_(note);
    }
  }

  if (!ui) {
    // スクリプトエディタから実行した場合はダイアログが出せないので、X_設定から読む
    var st = xReadSetting_();
    themes = String(st['今週のテーマ'] || '').trim();
    var note2 = String(st['今週あったこと'] || '').trim();
    if (note2) xSaveThisWeekNote_(note2);
    Logger.log('ダイアログなしで実行しています。テーマ=' + (themes || '（なし）') +
      ' / 今週あったこと=' + (note2 || '（なし）') +
      '　→ X_設定の「今週あったこと」「今週のテーマ」を使います。');
  }

  var t0 = Date.now();
  var ctx = xGenCtx_(themes, count);
  var posts = xGenInitial_(ctx);

  // 7本を並べて重なりを見て、重なった枠を別の返信から作り直す
  var edit = xEditWeek_(ctx, posts, null);

  xFinishWeek_(ctx, edit, t0);
}

/**
 * 書き出し・自己チェック・報告。最初の生成と「残して作り直す」で共通。
 * @param {Object} ctx
 * @param {Object} edit xEditWeek_ の戻り値 { posts, notes, shortage, skipped }
 * @param {number} t0 開始時刻
 */
function xFinishWeek_(ctx, edit, t0) {
  var posts = edit.posts;
  xWriteDrafts_(posts, ctx.count);
  xWriteWeekBlock_(posts, ctx.count);

  // 全文を読まずに済むよう、機械で照合できる分はここで検査する
  var ng = 0;
  try { ng = xCheckDrafts() || 0; } catch (e) { Logger.log('チェック失敗: ' + e.message); }

  var made = posts.filter(function (p) { return String(p['本文'] || '').trim(); });
  var secs = Math.round((Date.now() - t0) / 1000);
  var msg = made.length + '本できました（' + secs + '秒）。';
  if (edit.replaced) msg += edit.replaced + '本を作り直しました。';
  if (edit.noMaterial && edit.noMaterial.length) {
    msg += edit.noMaterial.map(function (i) { return (i + 1) + '本目'; }).join('・') +
      'は今週の材料が無かったので、題材を変えて考え方・方針として書きました（実績・発言は入れていません。「編集メモ」参照）。';
  }
  if (edit.shortage.length) {
    msg += '【不足】' + edit.shortage.map(function (i) { return (i + 1) + '本目'; }).join('・') +
      'は、残した本と重ならない材料が今週の返信に無かったため空けています。';
  }
  if (edit.skipped) msg += '（' + edit.skipped + '）';
  var asks = posts.filter(function (p) {
    var a = String(p['事実確認が必要な箇所'] || '').trim();
    return String(p['本文'] || '').trim() && a && a !== 'なし';
  }).length;
  msg += ng ? ('要確認が' + ng + '本あります（「自己チェック」列の赤い行）。') : '自動チェックは全部OKでした。';
  if (asks) msg += 'あなたへの質問が' + asks + '本ぶんあります（「事実確認が必要な箇所」列）。本文は質問の答えが無くても成り立つように書いてあります。';
  msg += ' X_投稿案_週形式 からコピーできます。';
  Logger.log(msg);
  xToast_(msg);
}

/**
 * 1回のAPI呼び出しで作る本数。
 *
 * 多いと出力が max_tokens に達して途中で切れる。
 * 並列に投げるので、細かく分けても全体の時間は増えない。
 */
var X_GEN_CHUNK = 2;

/**
 * 1回の出力の上限。
 *
 * Opus 5.5 は thinking を切れず、その分も max_tokens に入る。
 * effort: high だと考える分だけで1万トークンを超えることがあるため、
 * 本文ぶんを確保するには多めに取る必要がある。
 */
var X_GEN_MAX_TOKENS = 32000;

/** 生成全体の時間の上限（GASの6分制限に対する安全マージン） */
var X_GEN_TIME_LIMIT_MS = 4.8 * 60 * 1000;

/**
 * 生成の本体。
 *
 * 材料は3つ（本人の指定）。
 *   ① 外部ライターの企画シート … テーマ選びと切り口の作り方だけを参考にする
 *   ② 直近1週間の返信・引用   … 本人が実際に関心を持ったこと。いちばんの材料
 *   ③ 事業の方向性シート       … 誰に向けた発信かの判断に使う
 * 過去の投稿本文と経歴は、既定では渡さない（焼き直しの原因になるため）。
 *
 * 出力が上限で切れないよう2本ずつに分け、全部を並列で投げる。
 *
 * @param {string} themesText テーマ（空なら提案させる）
 * @param {number} count 本数
 * @return {Array<Object>}
 */
function xGenerate_(themesText, count) {
  var ctx = xGenCtx_(themesText, count);
  return xGenInitial_(ctx);
}

/**
 * 生成に使う材料をそろえる。最初の生成と、作り直し（週の編集）で共通。
 *
 * @param {string} themesText テーマ（空なら提案させる）
 * @param {number} count 本数
 * @return {Object} ctx
 */
function xGenCtx_(themesText, count) {
  var started = Date.now();

  var setting = xReadSetting_();
  var strategy = xReadStrategy_();
  var concept = setting['これからのコンセプト'] || '';
  if (!strategy && !concept) {
    throw new Error('発信の軸がありません。X_設定の「戦略シート名」にヒアリング・戦略シートの名前を入れるか、' +
      '「これからのコンセプト」を書いてください。');
  }

  var rules = xReadRules_();

  // ② 直近の返信・引用。これが主材料。
  var days = parseInt(setting['返信を読む日数'], 10);
  var replyList = xRecentReplyList_(isNaN(days) || days <= 0 ? 7 : days);
  var replies = xFormatReplies_(replyList);
  var noteList = xThisWeekNoteList_();
  var notes = xReadThisWeekNotes_();

  // ① 外部ライターの企画シート（テーマ選び・切り口の参考）
  var planNames = String(setting['企画シート名'] || '').split(/[,、]/)
    .map(function (x) { return x.trim(); }).filter(String);
  var planSheets = planNames.length ? xReadSheetsAsText_(planNames, 15000) : '';

  // 過去の投稿本文と経歴・年表は、既定では渡さない。
  // 手本があると、文体だけでなく中身（出来事・結論）まで引っぱられて焼き直しになる。
  // 文体は X_文体ルール に取り出してあるので、それだけで書かせる。
  var usePast = String(setting['過去の投稿・経歴を材料にする'] || '').trim() === 'はい';
  var sampleSheets = usePast ? xReadSampleSheets_() : '';
  var factSheets = usePast ? xReadFactSheets_() : '';
  var facts = usePast ? xReadFacts_(40) : '';

  var patterns = xPatternsText_();
  var trend = '';
  try { trend = xTrendText_(); } catch (e) { Logger.log('系統の傾向を読めませんでした: ' + e.message); }
  var plan = xReadWeekPlan_();
  var pastThemes = xPastThemes_(40);
  var reactions = xReadReactions_(30);
  var adopted = xAdoptedIdeas_();

  var system = xGenSystem_();
  var context = xGenContext_(setting, strategy, concept, rules,
                             facts, factSheets, sampleSheets, patterns, reactions, adopted,
                             replies, notes, planSheets, trend);

  return {
    started: started,
    setting: setting,
    system: system,
    context: context,
    themes: String(themesText || '').trim(),
    count: count,
    spec: xGenSpec_(count, setting),
    plan: plan,
    pastThemes: pastThemes,
    replyList: replyList,
    noteList: noteList,
    notes: notes
  };
}

/**
 * 最初の生成。2本ずつの束に分けて、全部まとめて並列で投げる。
 * @param {Object} ctx xGenCtx_ の戻り値
 * @return {Array<Object>} _idx（0始まりの枠番号）つきの投稿
 */
function xGenInitial_(ctx) {
  var started = ctx.started;
  var system = ctx.system, context = ctx.context, themes = ctx.themes, count = ctx.count;
  var spec = ctx.spec, plan = ctx.plan, pastThemes = ctx.pastThemes;

  // 書く前に1週間ぶんの企画を決める（同じ主張・同じ材料を2本にしないため）
  if (ctx.weekPlan === undefined) ctx.weekPlan = xPlanWeek_(ctx);
  var weekPlan = ctx.weekPlan;

  var jobs = [];
  for (var from = 0; from < count; from += X_GEN_CHUNK) {
    jobs.push({ from: from, n: Math.min(X_GEN_CHUNK, count - from) });
  }

  var results = xClaudeBatch_(jobs.map(function (j) {
    return {
      system: system,
      userText: context + '\n' + xGenRequest_(j.from, j.n, count, themes, plan, spec, pastThemes) +
        xPlanText_(weekPlan, j.from, j.n),
      maxTokens: X_GEN_MAX_TOKENS,
      effort: 'high'
    };
  }));

  var all = [];
  var failed = [];

  for (var i = 0; i < jobs.length; i++) {
    var got = [];
    if (results[i] && results[i].ok) {
      got = xParsePosts_(results[i].text);
      if (results[i].stopReason === 'max_tokens') {
        Logger.log((jobs[i].from + 1) + '本目から: 出力が上限で切れました。読めた分は ' +
          got.length + '/' + jobs[i].n + '本です。');
      }
      if (!got.length) {
        Logger.log((jobs[i].from + 1) + '本目からの読み取りに失敗（先頭200字）: ' +
          String(results[i].text).slice(0, 200));
      }
    } else {
      Logger.log((jobs[i].from + 1) + '本目からの生成に失敗: ' +
        ((results[i] && results[i].error) || '不明'));
    }

    // 多く返ってきた分は捨てる（割り当てた本数を超えると7本の配分が崩れる）
    if (got.length > jobs[i].n) got = got.slice(0, jobs[i].n);
    got.forEach(function (p, j) {
      p._idx = jobs[i].from + j;
      var wp = weekPlan && weekPlan[p._idx];
      if (wp && wp.subject && !wp.materials.length) p['題材'] = wp.subject;
    });
    all = all.concat(got);

    // 足りない分（束ごと落ちた・途中で切れた）は、1本ずつやり直す。
    // 切れた場合に残るのは前のほうなので、欠けているのは後ろの番号。
    for (var k = got.length; k < jobs[i].n; k++) failed.push(jobs[i].from + k);
  }

  // 落ちた分だけ、1本ずつ・これも並列で作り直す
  if (failed.length && Date.now() - started < X_GEN_TIME_LIMIT_MS) {
    var retry = xClaudeBatch_(failed.map(function (idx) {
      return {
        system: system,
        userText: context + '\n' + xGenRequest_(idx, 1, count, themes, plan, spec, pastThemes) +
          xPlanText_(weekPlan, idx, 1),
        maxTokens: X_GEN_MAX_TOKENS,
        effort: 'high'
      };
    }));

    for (var r = 0; r < retry.length; r++) {
      if (!retry[r] || !retry[r].ok) {
        Logger.log((failed[r] + 1) + '本目を飛ばしました: ' +
          ((retry[r] && retry[r].error) || '不明'));
        continue;
      }
      var one = xParsePosts_(retry[r].text).slice(0, 1);
      if (one.length) { one[0]._idx = failed[r]; all = all.concat(one); }
      else Logger.log((failed[r] + 1) + '本目を飛ばしました（読み取り不能）: ' +
        String(retry[r].text).slice(0, 200));
    }
  }

  // やり直した分が後ろに付くので、割り当てた番号順（＝曜日順）に戻す
  all.sort(function (a, b) { return a._idx - b._idx; });

  Logger.log('生成 ' + all.length + '/' + count + '本 … ' +
    Math.round((Date.now() - started) / 1000) + '秒');
  return all;
}

/**
 * 本ごとの「使う型」と「カギカッコで始めてよいか」を先に決める。
 *
 * 並列に投げると、前の回で何を使ったかを見て避けることができない。
 * なので避けるのではなく、最初に割り振ってしまう。
 *
 * @param {number} count 本数
 * @return {Object} { pattern: Array<string>, quoteOk: Array<boolean> }
 */
function xGenSpec_(count, setting) {
  var names = xPatternNames_();
  var roles = xRoleOrder_(count, setting || {});
  var pattern = [];
  var quoteOk = [];

  // カギカッコ始まりは週に2本まで。間を空けて割り当てる。
  var quoteSlots = count >= 5 ? [1, Math.floor(count / 2) + 1] : [1];

  for (var i = 0; i < count; i++) {
    pattern.push(names.length ? names[i % names.length] : '');
    quoteOk.push(quoteSlots.indexOf(i) >= 0);
  }
  return { pattern: pattern, quoteOk: quoteOk, role: roles };
}

/**
 * 週の役割配分を、本数ぶんの並びに展開する。
 * 同じ役割が続かないように、1種類ずつ順に取っていく。
 *
 *   仕事:2 / 見落とし:2 / 失敗:1 / すれ違い:1 / 日常:1
 *   → 仕事, 見落とし, 失敗, すれ違い, 日常, 仕事, 見落とし
 */
function xRoleOrder_(count, setting) {
  var lines = xSettingLines_(setting, '週の役割配分', X_DEFAULT_ROLES);
  var buckets = [];
  lines.forEach(function (line) {
    var m = line.match(/^(.+?)\s*[:：]\s*([0-9０-９]+)\s*本?$/);
    var name = m ? m[1].trim() : line.trim();
    var n = m ? parseInt(m[2].replace(/[０-９]/g, function (d) {
      return String.fromCharCode(d.charCodeAt(0) - 0xFEE0);
    }), 10) : 1;
    if (name && n > 0) buckets.push({ name: name, left: n });
  });
  if (!buckets.length) return [];

  var out = [];
  while (out.length < count) {
    var took = false;
    for (var i = 0; i < buckets.length && out.length < count; i++) {
      if (buckets[i].left > 0) { out.push(buckets[i].name); buckets[i].left--; took = true; }
    }
    // 配分の合計より本数が多ければ、最初から繰り返す
    if (!took) buckets.forEach(function (b) { b.left = 1; });
  }
  return out;
}

/** 型カタログの型名を並べる（「使わない」に印が付いた型は外す） */
function xPatternNames_() {
  var list;
  try { list = xReadPatterns_(); } catch (e) { return []; }
  return (list || []).map(function (p) { return String(p.name || '').trim(); })
    .filter(function (s) { return s; });
}

/** 生成のシステムプロンプト */
function xGenSystem_() {
  return [
    'あなたは、ある書き手の文体を完全に再現して X の投稿を書く人です。',
    '',
    '■ 言い切りの使い分け（この書き手の核になる規則）',
    '',
    '言い切っていいのは、この書き手が自分で経験したことだけです。',
    '  例：「早いのは、今日だけ」「あの冷や汗が怖くて、結局自分で見るしかなかった」',
    '  自分の経験は、留保をつけずにはっきり言い切ってください。そこがこの書き手の強みです。',
    '',
    '他人の傾向・統計・一般論は、言い切らないでください。',
    '  「9割が」「ほぼ全員」「絶対に」「本質は」「決め手はこれだけ」は使いません。',
    '  必ず留保をつけてください。「〜な気がします」「たぶん」「〜かもしれません」',
    '',
    '確かめていないことを本当のように書くのが、この書き手が一番嫌うことです。',
    '',
    '元になった発言がある場合、その発言より強く言い切らないでください。',
    '「〜だったりします」「〜かもしれません」という留保は、そのまま残します。',
    '元の発言に無い因果関係（だから成功する、など）を足さないでください。',
    '',
    '■ 投稿作成のルール（本人の指定）',
    '',
    '- 作るのは完成品ではなく、本人が手を入れる前提の叩き台です。',
    '- 1投稿につき原則1テーマ。複数の過去エピソードを1本に混ぜないでください。',
    '- 1週間に同じ主張は原則1本です。長文と短文で同じ主張を言い直さないでください。',
    '  同じ週の他の本が言っていることを、言い方を変えて繰り返さないでください。',
    '- 毎回「仕組み化が大事」「社長の仕事を減らそう」という結論に着地させないでください。',
    '  7本のうち、仕組み化を結論にする投稿は多くても2本までにしてください。',
    '- 本人が実際に経験していない話、言われていないセリフ、確認できない数字は創作しないでください。',
    '- 過去に使った話を無理に引っ張り出さず、今週の返信から考えられることを優先してください。',
    '- 情報が足りない場合、長くするために別の体験談を足さず、短く仕上げてください。',
    '  長文の枠でも、材料が足りなければ短文の長さで構いません。',
    '- 実際に経験したことは過去形で書いてください。',
    '  これから大切にしたい仕事の進め方は「こうしたい」「こう考えている」と書いてください。',
    '  まだ実績が無いこと（これから始める事業・サービス・取り組み）を、',
    '  すでにやっている・成果が出ているように書かないでください。',
    '  実績として書いてよいのは、材料（返信・今週あったこと）に書かれていることだけです。',
    '- 本文に【要確認】や「（ここに実例）」のような穴を残さないでください。原稿は必ず完成させてください。',
    '  確認済みの事実（材料に書かれていること）だけで書けるなら、それで完成させてください。',
    '  実例が無い場合は、この書き手が今後大切にしたい考え方・仕事の方針として書いてください。',
    '  それでも本人に確かめたいことがあれば、本文には書かず「事実確認が必要な箇所」に質問として書いてください。',
    '- 実績、相談者・お客様・スタッフの発言（セリフ）を創作することは禁止です。',
    '  カギカッコで誰かの言葉を書いてよいのは、材料にその言葉があるときだけです。',
    '- 7本全部を業務改善や仕組み化の話にしないでください（多くても2本まで）。',
    '  仕事の考え方・実務の視点・人柄・日常の気づき・これからやりたい仕事など、題材に幅を持たせてください。',
    '- 毎回サービス紹介や固定ポストへの誘導を入れないでください。',
    '  「固定ポストを見てください」「DMください」「ご相談はこちら」などは基本入れません。',
    '  週の傾向で「人脈」の日だけ、最後の1文で軽く触れる程度なら構いません。',
    '',
    '■ 最重要のルール',
    '',
    '- 「文体ルール」の禁止語は、絶対に使わないでください。',
    '  これは過去にこの書き手が自分で消した語です。1つでも混ざると本人の文ではなくなります。',
    '- 一次情報が与えられている場合、それを必ず使ってください。',
    '  数字・固有名詞・実際にあった出来事は、一次情報にあるものだけを書いてください。',
    '  それらしい具体例を作らないでください。',
    '- 年齢・時期・頻度・回数は、一次情報に書かれている表現をそのまま使ってください。',
    '  例：「14歳で」とあれば「14歳で」。「30代の頃」などに変えない。',
    '  元の表現が不自然に見えても、直さずにそのまま使ってください。',
    '  書かれていない頻度（「年に1回」など）を足さないでください。',
    '- 投稿例（文体の手本）に書かれている出来事や数字は、事実とは限りません。',
    '  外部ライターが作った話が混ざっています。文体だけを見て、事実は拾わないでください。',
    '- 新しいほうの投稿例を手本にしてください。古い投稿はいまの軸とは違います。',
    '- 一般的によくあるSNS文章術の型に寄せないでください。この書き手の型に寄せてください。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');
}

/** 毎回共通で渡す材料 */
function xGenContext_(setting, strategy, concept, rules, facts,
                      factSheets, sampleSheets, patterns, reactions, adopted,
                      replies, notes, planSheets, trend) {
  var parts = [];

  if (strategy) {
    parts.push('# ③ 事業の方向性とターゲット（発信の軸の確認用）');
    parts.push('誰に向けた発信か、軸から外れていないかを確認するための資料です。');
    parts.push('ここから毎回投稿テーマを作らないでください。テーマは ② の返信・引用から作ります。');
    parts.push('ここに書かれている文言を、そのまま投稿に流し込まないでください。');
    parts.push('ここに書かれている事業・サービスの多くは「これからやりたいこと」です。実績として書かないでください。');
    parts.push(strategy);
    parts.push('');
  }
  if (concept) {
    parts.push('# これからのコンセプト（補足）');
    parts.push(concept);
    parts.push('');
  }
  if (setting['扱わないこと']) {
    parts.push('# 扱わないこと（書かない）');
    parts.push(setting['扱わないこと']);
    parts.push('');
  }

  parts.push('# 文体ルール（過去の書き換え履歴から抽出）');
  parts.push(rules);
  parts.push('');

  if (trend) {
    parts.push('# 読まれやすい系統・つながりやすい系統（過去半年の数字）');
    parts.push('過去の投稿を、役割と分類に振り分けて数字を比べた結果です。');
    parts.push('使うのは「どの系統が読まれ、どの系統がフォローや会話につながったか」だけです。');
    parts.push('過去の投稿の中身（出来事・結論・言い回し）は使わないでください。');
    parts.push('割り当てた役割と分類は変えずに、その中でテーマや切り口を選ぶときの参考にしてください。');
    parts.push('表示回数よりも、つながりやすい系統を重く見てください。');
    parts.push(trend);
    parts.push('');
  }

  if (replies || notes) {
    parts.push('# ② 直近の返信・引用（いちばんの材料）');
    parts.push('本人が実際に関心を持ったこと、考えたこと、新しく出てきた疑問を拾ってください。');
    parts.push('過去に使った話を引っ張り出すより、ここから考えられることを優先してください。');
    parts.push('・返信は相手の投稿への反応です。相手の元投稿はここにありません。');
    parts.push('  何についての発言かが読み取れない場合は、推測で確定せず、その返信で本人が言っている考えだけを使ってください。');
    parts.push('  相手の投稿の中身を書く必要があるなら、本文には書かず「事実確認が必要な箇所」で質問してください。');
    parts.push('・本人の発言を、元の意味より強く断定しないでください。');
    parts.push('  「〜だったりします」「〜かもしれません」は、そのまま残してください。');
    if (notes) {
      parts.push('');
      parts.push('## 今週あったこと（本人が書いたメモ）');
      parts.push('7本のうち最低1本は、この出来事を中心に組み立ててください。');
      parts.push(notes);
    }
    if (replies) {
      parts.push('');
      parts.push('## 返信・引用');
      parts.push(replies);
    }
    parts.push('');
  }

  if (planSheets || patterns) {
    parts.push('# ① 外部ライターの企画（テーマ選びと切り口の参考）');
    parts.push('テーマの選び方、切り口の作り方だけを参考にしてください。');
    parts.push('内容をそのまま言い換えて再利用しないでください。出来事・数字・セリフは使いません。');
    if (planSheets) { parts.push(''); parts.push(planSheets); }
    if (patterns) { parts.push(''); parts.push('## 構成の型（骨組みだけ）'); parts.push(patterns); }
    parts.push('');
  }

  if (sampleSheets) {
    parts.push('# 完成した投稿（文体の手本）');
    parts.push('⚠️ ここは「書き方」だけを見てください。');
    parts.push('外部ライターが作った事実でない話が混ざっています。');
    parts.push('ここに書かれている出来事・数字は一切使わないでください。');
    parts.push(sampleSheets);
    parts.push('');
  }

  if (factSheets) {
    parts.push('# 経歴・インタビュー（設定で「はい」のときだけ渡している）');
    parts.push('ここに書かれている事実・数字・出来事だけを使ってください。');
    parts.push(factSheets);
    parts.push('');
  }

  if (facts) {
    parts.push('# 追加の一次情報');
    parts.push('「今週あったこと」が含まれている場合、それを最優先で使ってください。');
    parts.push('いちばん新しい出来事なので、過去の棚卸しより読む価値があります。');
    parts.push('7本のうち最低1本は、この出来事を中心に組み立ててください。');
    parts.push(facts);
    parts.push('');
  }

  var landings = xSettingLines_(setting, '禁止する着地', X_DEFAULT_BANNED_LANDINGS);
  if (landings.length) {
    parts.push('# この結論で締めない');
    parts.push('読み終えたときに、読者が前と違うことを考えている状態にしてください。');
    parts.push('次の言い回しに安易に着地させないでください。');
    landings.forEach(function (e) { parts.push('  × ' + e); });
    parts.push('');
  }

  var episodes = xSettingLines_(setting, '使用禁止のエピソード', X_DEFAULT_BANNED_EPISODES);
  if (episodes.length) {
    parts.push('# 今回は使わないエピソード');
    parts.push('過去の投稿で何度も使った話です。一次情報に書かれていても、今回は使わないでください。');
    parts.push('触れるだけ・たとえに出すだけも不可です。');
    episodes.forEach(function (e) { parts.push('  × ' + e); });
    parts.push('');
  }

  if (adopted) {
    parts.push('# 今回書く企画（本人が選んだもの）');
    parts.push('この企画を書いてください。テーマを自分で考える必要はありません。');
    parts.push('「もとの返信」は、本人が実際に書いた文です。');
    parts.push('**その返信より強く言い切らないでください。**');
    parts.push('「〜だったりします」を「〜する」に変えない。根拠のない因果を足さない。');
    parts.push('「要確認」がある企画は、その部分を創作しないでください。');
    parts.push('分かっていることだけで書くか、考え方として書いて完成させ、確かめたいことは「事実確認が必要な箇所」に質問として書いてください。');
    parts.push(adopted);
    parts.push('');
  }

  if (reactions) {
    parts.push('# 読者からの反応・引用した相手の投稿（外からの入力）');
    parts.push('ここは他人の言葉です。扱い方に注意してください。');
    parts.push('・実際に言われた言葉として、そのまま引用してよいです。');
    parts.push('  「こう言われたことがあります」の形で使ってください。');
    parts.push('・「みんながそう思っている」「よくある悩みです」と一般化しないでください。');
    parts.push('  1人が言ったことは、1人が言ったこととして書いてください。');
    parts.push('・ここにある他人の視点は、本人が自分では思いつかない角度です。');
    parts.push('  内側の棚卸しだけで書くと既出の繰り返しになるので、積極的に使ってください。');
    parts.push('');
    parts.push('【「参考になった他人の投稿」「引用した相手の投稿」の扱い】');
    parts.push('借りてよいのは、扱っている"論点"だけです。');
    parts.push('・その投稿の言い回し、構成、たとえ話、事例は使わないでください。');
    parts.push('・「こういうことが問題になるのか」という問いだけを受け取り、');
    parts.push('  その問いに対する答えは、必ずこの書き手自身の経験から書いてください。');
    parts.push('・結果として、元の投稿とは違う結論になって構いません。');
    parts.push('・発信の軸（発信設計書）からは外れないでください。');
    parts.push('  論点が軸に合わない場合は、使わずに飛ばしてください。');
    parts.push(reactions);
    parts.push('');
  }

  return parts.join('\n');
}

/** その回ぶんの依頼 */
function xGenRequest_(from, n, total, themes, plan, spec, pastThemes) {
  var parts = [];
  parts.push('# 依頼');
  parts.push('全' + total + '本のうち、' + (from + 1) + '本目から' + (from + n) + '本目までの ' +
             n + '本を書いてください。');

  if (themes) {
    parts.push('テーマ（全体ぶん。この中から、今回の' + n + '本に合うものを使ってください）:');
    parts.push(themes);
  } else {
    parts.push('テーマはあなたが決めてください。似たテーマを並べず、角度を変えてください。');
  }
  parts.push('');

  // 各本の分類
  parts.push('## この回で書く分（1本ずつ）');
  for (var i = 0; i < n; i++) {
    var idx = from + i;
    var slot = plan[idx];
    if (slot) {
      var line = '・' + (idx + 1) + '本目（' + slot.date + '）: ' + (slot.len || '長文');
      if (slot.cat) line += ' / 本文=' + slot.cat;
      if (slot.closeCat && slot.closeCat !== slot.cat) line += ' / 締め=' + slot.closeCat;
      var layer = xLayerOf_(slot.cat);
      if (layer) line += ' / 読者の温度=' + layer;
      if (slot.memo) line += ' / メモ=' + slot.memo;
      parts.push(line);
    } else {
      parts.push('・' + (idx + 1) + '本目: ' + xLayerPlan_(total)[idx]);
    }
  }
  if (plan.length) {
    parts.push('「締め」が本文と違う分は、最後の一文だけをその分類に寄せてください。');
  }
  parts.push('');

  if (spec.role && spec.role.length) {
    parts.push('## 投稿の役割（目安）');
    parts.push('7本が全部「現場で見落とされている問題の指摘」にならないよう、役割を分けています。');
    parts.push('材料（返信・今週あったこと）にその役割の話が無い場合は、作り話で埋めず、');
    parts.push('材料のある別の役割に変えてください。変えた場合は「役割」欄にそう書いてください。');
    for (var ri = 0; ri < n; ri++) {
      var role = spec.role[from + ri];
      if (role) parts.push('・' + (from + ri + 1) + '本目の役割: ' + role);
    }
    parts.push('');
  }

  // 視点の角度
  parts.push('## 視点の角度（1本ずつ違う角度から書く）');
  parts.push('素材が同じでも、どの向きから見るかで結論が変わります。');
  parts.push('文体をなぞるだけだと、過去に書いたことの焼き直しになります。');
  for (var a = 0; a < n; a++) {
    var ai = (from + a) % X_ANGLES.length;
    parts.push('・' + (from + a + 1) + '本目の角度: ' + X_ANGLES[ai]);
  }
  parts.push('');

  if (pastThemes && pastThemes.length) {
    parts.push('## すでに書いたテーマ（同じ結論に着地しない）');
    parts.push('同じテーマを扱っても構いませんが、下と同じ着地にはしないでください。');
    parts.push('「結局いちばん大事なのは◯◯でした」で終わる形が繰り返されています。');
    parts.push('読み終えたときに、読者が前と違うことを考えている状態にしてください。');
    pastThemes.slice(0, 30).forEach(function (t) { parts.push('  ・' + t); });
    parts.push('');
  }

  // 型と冒頭は、全本ぶんを先に割り振ってある（並列に作るので後から避けられない）
  parts.push('## 使う型（割り当て済み。変えないでください）');
  var others = [];
  for (var q = 0; q < total; q++) {
    var name = spec.pattern[q];
    if (!name) continue;
    if (q >= from && q < from + n) {
      parts.push('・' + (q + 1) + '本目の型: ' + name);
    } else if (others.indexOf(name) < 0) {
      others.push(name);
    }
  }
  if (others.length) {
    parts.push('他の本で使う型なので、この回では使わないでください: ' + others.join('、'));
  }
  parts.push('');

  parts.push('## 冒頭の入り方');
  parts.push('カギカッコで誰かの台詞や心の声を置いて始める形は、週に2本までに決めています。');
  for (var w = 0; w < n; w++) {
    var wi = from + w;
    parts.push('・' + (wi + 1) + '本目: ' +
      (spec.quoteOk[wi]
        ? 'カギカッコ始まりにしてよい（材料にある本人・相手の言葉だけ。無ければカギカッコで始めない）'
        : 'カギカッコで始めないこと。事実・数字・場面の描写・自分の行動など別の入り方にする'));
  }
  parts.push('');

  parts.push('');
  parts.push('## 長文と短文');
  parts.push('・長文 … じっくり書く。背景・具体例・そこから言えることまで入れる');
  parts.push('  　　　 ただし材料が足りなければ短くてよい。別の体験談を足して長くしない。');
  parts.push('・短文 … 110〜150字。1つの主張を、1つの具体例で短く書く。説明を足さない。');
  parts.push('  　　　 長文の論点の切り出しや、長文の言い直しではありません。短文も、それぞれ別の主張にしてください。');
  parts.push('・長文と短文で同じ主張・同じ材料を使わないでください（1週間に同じ主張は原則1本）。');
  parts.push('');

  var lenHint = xLengthHint_();
  if (lenHint) {
    parts.push('## 長さ');
    parts.push(lenHint);
    parts.push('');
  }

  parts.push('--- 出力形式 ---');
  parts.push('{"posts":[{');
  parts.push('  "テーマ": "この投稿のテーマ（30字以内）",');
  parts.push('  "ターゲット層": "潜在層／準顕在層／顕在層／明確層 のどれか",');
  parts.push('  "使った型": "構成の型の型名",');
  parts.push('  "分類": "拡散／共感／人脈／助け／成果／専門／自分の言葉／仕組み化 のどれか",');
  parts.push('  "役割": "割り当てた役割。材料が無くて変えた場合は「〇〇→△△（理由）」",');
  parts.push('  "投稿の狙い": "30字以内",');
  parts.push('  "元になった返信・切り口": "どの返信（日付と冒頭）か、または企画シートのどの切り口か。80字以内",');
  parts.push('  "本文": "X投稿文の叩き台。改行もそのまま",');
  parts.push('  "冒頭3行": "最初の3行だけを抜き出したもの",');
  parts.push('  "事実確認が必要な箇所": "本人への質問（本文とは別）。本文は質問の答えが無くても成り立つように書く。無ければ「なし」"');
  parts.push('}]}');
  parts.push('※ posts には必ず ' + n + ' 本だけ入れてください。');

  return parts.join('\n');
}

/** 文体の参考として、実投稿をいくつか拾う（反応が良い順があればそれを優先） */
function xPickSamples_(n) {
  var rows;
  try { rows = xReadLog_(); } catch (e) { return []; }
  if (!rows.length) return [];

  var withImp = rows.filter(function (r) {
    return Number(r['インプレッション']) > 0;
  });

  if (withImp.length >= n) {
    withImp.sort(function (a, b) {
      return Number(b['インプレッション']) - Number(a['インプレッション']);
    });
    return withImp.slice(0, n).map(function (r) { return String(r['実投稿']); });
  }

  // 反応データが無ければ、直近のものを使う
  return rows.slice(-n).map(function (r) { return String(r['実投稿']); })
    .filter(function (s) { return s.trim(); });
}

/**
 * 枠番号（_idx）の順に並べ、空いた枠には空の投稿を入れる。
 * @param {Array<Object>} posts
 * @param {number} count 本数（省略時は posts の最大枠番号まで）
 * @return {Array<Object>}
 */
function xBySlot_(posts, count) {
  var max = count || 0;
  posts.forEach(function (p, i) {
    if (p._idx === undefined || p._idx === null) p._idx = i;
    max = Math.max(max, p._idx + 1);
  });
  var out = [];
  for (var i = 0; i < max; i++) out.push(null);
  posts.forEach(function (p) { if (!out[p._idx]) out[p._idx] = p; });
  for (var j = 0; j < max; j++) {
    if (!out[j]) out[j] = { _idx: j, '本文': '', _note: '材料不足のため空き', _state: '空き' };
  }
  return out;
}

/** 投稿案をシートに書き出す */
function xWriteDrafts_(posts, count) {
  var sh = xSheet_(X_SHEETS.DRAFT, X_DRAFT_HEADERS);
  if (!posts.length && !count) return;

  // 空いた枠も1行として残す。「残して作り直す」が枠番号で読めるようにするため。
  posts = xBySlot_(posts, count);

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var width = Math.max(sh.getLastColumn(), X_DRAFT_HEADERS.length);
  var rows = posts.map(function (p) {
    var body = String(p['本文'] || '');
    var ask = String(p['事実確認が必要な箇所'] || '').trim();
    var state = p._state || (!body.trim() ? '空き' :
      (/【要確認/.test(body) ? '要確認' : (ask && ask !== 'なし' ? '質問あり' : '未')));
    var v = {
      '作成日時': now,
      '枠': p._idx + 1,
      '分類': p['分類'] || '',
      '役割': (p['役割'] || '') + (p['題材'] && String(p['役割'] || '').indexOf(p['題材']) < 0 ? '（題材: ' + p['題材'] + '）' : ''),
      '使った型': p['使った型'] || '',
      'ターゲット層': p['ターゲット層'] || '',
      'テーマ': p['テーマ'] || '',
      '投稿の狙い': p['投稿の狙い'] || p['狙い'] || '',
      '元になった返信・切り口': p['元になった返信・切り口'] || p['使った事実'] || '',
      '本文': p['本文'] || '',
      '冒頭3行': p['冒頭3行'] || '',
      '事実確認が必要な箇所': p['事実確認が必要な箇所'] || '',
      '編集メモ': p._note || '',
      '自己チェック': '',
      '投稿予定日': '',
      '状態': state
    };
    var row = X_DRAFT_HEADERS.map(function (h) { return v[h]; });
    while (row.length < width) row.push('');   // 手で足した列のぶん
    return row;
  });

  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, width).setValues(rows);

  ['本文', '元になった返信・切り口', '事実確認が必要な箇所', '編集メモ'].forEach(function (h) {
    var c = xDraftCol_(h);
    sh.setColumnWidth(c, h === '本文' ? 520 : 300);
    sh.getRange(2, c, sh.getLastRow() - 1, 1).setWrap(true);
  });
}


/**
 * いつものシートと同じ「1週間ブロック」の形で書き出す。
 *
 *   A列      B〜H列（1列＝1日）
 *   日付     月(10/19) …
 *   投稿日   2026-10-19 …
 *   投稿文   生成した本文 …
 *   修正欄   （空。直すときに使う）
 *   空白行
 *
 * そのまま選択してコピーすれば、既存のシートに貼れる。
 */
function xWriteWeekBlock_(posts, count) {
  if (!posts || (!posts.length && !count)) return;
  posts = xBySlot_(posts, count);

  var map = xReadSetting_();
  var startLabel = (map['▼ブロックの先頭ラベル'] || '日付').trim();
  var dateLabel  = (map['▼投稿日のラベル'] || '投稿日').trim();
  var tmplLabel  = (map['▼雛形のラベル'] || '投稿文').trim();
  var postLabel  = (map['▼実投稿のラベル'] || '修正欄').trim();
  var blankLabel = String(map['▼無視するラベル'] || '空白行').split(/[,、]/)[0].trim();

  var width = posts.length;
  var wdays = ['日', '月', '火', '水', '木', '金', '土'];
  var plan = xReadWeekPlan_();

  // 日付は X_週の傾向 に合わせる。無ければ次の月曜から。
  var base = new Date();
  var add = (8 - base.getDay()) % 7;
  if (add === 0) add = 7;
  base.setDate(base.getDate() + add);

  var headRow = [startLabel];
  var dateRow = [dateLabel];
  var textRow = [tmplLabel];
  var fixRow  = [postLabel];

  for (var i = 0; i < width; i++) {
    var slot = plan[i];
    var label, ymd;
    if (slot && slot.date) {
      // 週の傾向シートの日付をそのまま使う（手で直した分を尊重する）
      label = slot.date;
      ymd = slot.date.replace(/（.+?）/, '');
    } else {
      var d = new Date(base.getTime());
      d.setDate(base.getDate() + i);
      ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
      label = wdays[d.getDay()] + '（' + Utilities.formatDate(d, 'Asia/Tokyo', 'M/d') + '）';
    }
    var body = String(posts[i]['本文'] || '');
    // 【要確認】が残っている原稿は完成稿として扱わない。見出しで分かるようにする。
    var ask = String(posts[i]['事実確認が必要な箇所'] || '').trim();
    var mark = !body.trim() ? '（空き）' : (/【要確認/.test(body) ? '（要確認・未完成）' :
      (ask && ask !== 'なし' ? '（質問あり）' : ''));
    headRow.push(label + (slot && slot.cat ? ' ' + slot.cat : '') + mark);
    dateRow.push(ymd + (slot && slot.time ? ' ' + slot.time : ''));
    textRow.push(body);
    fixRow.push('');
  }

  var sh = xSheet_(X_SHEETS.WEEK);
  var startRow = sh.getLastRow() + (sh.getLastRow() ? 1 : 0) + 1;

  var block = [headRow, dateRow, textRow, fixRow, [blankLabel]];
  // 行の長さを揃える
  var cols = width + 1;
  block = block.map(function (row) {
    while (row.length < cols) row.push('');
    return row;
  });

  sh.getRange(startRow, 1, block.length, cols).setValues(block);
  sh.getRange(startRow, 2, block.length, width).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 90);
  for (var c = 2; c <= cols; c++) sh.setColumnWidth(c, 300);
  sh.getRange(startRow, 1, block.length, 1).setFontWeight('bold').setBackground('#eef3f9');
}


/**
 * すでに生成した投稿のテーマを集める（新規性の判定に使う）。
 */
function xPastThemes_(limit) {
  var out = [];
  var sh = xBook_().getSheetByName(X_SHEETS.DRAFT);
  if (sh && sh.getLastRow() > 1) {
    xRepairHeaders_(sh, X_DRAFT_HEADERS);
    var values = sh.getRange(2, xDraftCol_('テーマ'), sh.getLastRow() - 1, 1).getValues();
    for (var i = values.length - 1; i >= 0 && out.length < limit; i--) {
      var t = String(values[i][0]).trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    }
  }
  return out;
}


/**
 * 「今週あったこと」を一次情報として保存する。
 * アンケートを別途送るような手間を増やさず、生成のついでに1行だけ溜める。
 */
function xSaveThisWeekNote_(note) {
  var sh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  sh.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
    '今週あったこと',
    '今週あったこと（' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d') + '）',
    note,
    0
  ]);
  sh.getRange(sh.getLastRow(), 4).setWrap(true);
}


/** X_設定 の「1本の文字数の目安」を読む。空なら指定なし。 */
function xLengthHint_() {
  var v = String(xReadSetting_()['1本の文字数の目安'] || '').trim();
  var n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  if (!n || isNaN(n)) return '';
  return '本文は ' + n + '字前後にしてください（±2割まで）。' +
         '短くするために内容を削るのではなく、言い回しを詰めてください。';
}

// ===== 15_XMenu.js =====

/**
 * 15_XMenu.js
 * スプレッドシートのメニュー
 *
 * このスクリプトを過去ログのスプレッドシートにバインドすると、
 * 開いたときに「X 文体ツール」メニューが出る。
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('X 文体ツール')
      .addItem('① 設定シートを作る / 更新する', 'xSetup')
      .addItem('　 過去ログを読めるか確認する', 'xPreviewLog')
      .addItem('　 戦略シートを読めるか確認する', 'xPreviewStrategy')
      .addItem('　 A列のラベルを数える', 'xPreviewLabels')
      .addSeparator()
      .addItem('② 質問リストを取り込む', 'xImportQuestionSheet')
      .addItem('② メインシートの回答を取り込む', 'xImportMainAnswers')
      .addItem('③ 文体を抽出する（完了まで数回押す）', 'xExtractStyle')
      .addItem('③ 構成の型を取り出す', 'xExtractPatterns')
      .addSeparator()
      .addItem('今週の傾向シートを作る（紫微斗数）', 'xSetupWeekPlan')
      .addItem('反応ログのシートを作る', 'xSetupReactionLog')
      .addSeparator()
      .addItem('アナリティクス: 貼り付けシートを作る', 'xSetupAnalyticsSheet')
      .addItem('アナリティクス: 取り込む（返信を一次情報に）', 'xImportAnalytics')
      .addItem('アナリティクス: 状況を見る', 'xAnalyticsSummary')
      .addItem('アナリティクス: 伸びる系統を調べる', 'xAnalyzeTrends')
      .addSeparator()
      .addItem('★ 返信から新しい企画を発掘する', 'xMineTopics')
      .addItem('　 発掘をやり直す', 'xResetMining')
      .addItem('　 抽出をやり直す', 'xResetExtract')
      .addSeparator()
      .addItem('④ 今週の投稿案を作る', 'xGeneratePosts')
      .addItem('④ 選んだ本を残して、残りを作り直す', 'xRegenerateDrafts')
      .addItem('　 投稿案を自動チェックする', 'xCheckDrafts')
      .addSeparator()
      .addItem('質問に1つ答える（一次情報を足す）', 'xAskQuestion')
      .addSeparator()
      .addItem('使わなかった雛形を一覧にする', 'xListUnusedTemplates')
      .addToUi();
  } catch (e) {
    // バインドされていない環境では何もしない
  }
}

// ===== 16_XFact.js =====

/**
 * 16_XFact.js
 * 一次情報を溜める
 *
 * 業者さんの仕組みは「ジャンル別の質問に答えてもらい、その回答から記事を書く」だった。
 * 質問の設計は正しいが、回答が入っていなければ出力は一般論になる。
 *
 * ここでは回答をシートに溜めて、生成時の素材として渡す。
 * 既存の「質問リスト」シートがあればそれを使い、無ければコンセプトから質問を作る。
 */

/** 既存の質問リストシートの候補名 */
var X_QLIST_NAMES = ['質問リスト', '質問', 'questions'];

/**
 * 質問を1つ出して、答えを X_一次情報 に保存する。
 * メニューから何度でも実行できる。空き時間に1問ずつ足していく使い方。
 */
function xAskQuestion() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (!ui) throw new Error('この機能はスプレッドシートのメニューから実行してください。');

  var q = xPickQuestion_();

  var res = ui.prompt(
    '一次情報を1つ足す',
    q.genre ? ('【' + q.genre + '】\n\n' + q.text + '\n\n' +
               '※実際にあったこと、数字、言われた言葉を、そのまま書いてください。\n' +
               '　短くて構いません。答えられなければキャンセルしてください。')
            : (q.text + '\n\n※実際にあったこと、数字、言われた言葉を、そのまま書いてください。'),
    ui.ButtonSet.OK_CANCEL);

  if (res.getSelectedButton() !== ui.Button.OK) return;
  var answer = String(res.getResponseText() || '').trim();
  if (!answer) { xToast_('空だったので保存しませんでした。'); return; }

  var sh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  sh.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
    q.genre || '', q.text, answer, 0
  ]);
  sh.setColumnWidth(4, 480);
  sh.getRange(sh.getLastRow(), 4).setWrap(true);

  xToast_('保存しました。続けるなら、もう一度「質問に答える」を押してください。');
}

/**
 * 質問を1つ選ぶ。
 * 既存の質問リストがあれば、まだ答えていないものを優先する。
 */
function xPickQuestion_() {
  var list = xLoadQuestionList_().concat(xStockQuestions_());
  var answered = xAnsweredQuestions_();

  if (list.length) {
    var unanswered = list.filter(function (q) { return answered.indexOf(q.text) < 0; });
    var pool = unanswered.length ? unanswered : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 質問リストが無い場合は、コンセプトから質問を作る
  return { genre: '', text: xGenerateQuestion_(answered) };
}

/** X_未回答の質問 から未回答のものを読む */
function xStockQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.QSTOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return String(r[1]).trim() && !String(r[2]).trim(); })
    .map(function (r) { return { genre: String(r[0]).trim(), text: String(r[1]).trim() }; });
}

/** 既存の「質問リスト」シートを読む（番号/ジャンル/質問 の並びを想定） */
function xLoadQuestionList_() {
  var ss = xBook_();
  var sh = null;
  for (var i = 0; i < X_QLIST_NAMES.length; i++) {
    sh = ss.getSheetByName(X_QLIST_NAMES[i]);
    if (sh) break;
  }
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(3, sh.getLastColumn())).getValues();
  var out = [];
  values.forEach(function (r) {
    var genre = String(r[1] || '').trim();
    var text = String(r[2] || '').trim();
    if (!text) { // 2列しかない場合などの保険
      text = String(r[1] || '').trim();
      genre = '';
    }
    if (text) out.push({ genre: genre, text: text });
  });
  return out;
}

/** すでに答えた質問の一覧 */
function xAnsweredQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(String);
}

/** 質問リストが無いときに、コンセプトから質問を1つ作る */
function xGenerateQuestion_(answered) {
  var setting = xReadSetting_();
  var concept = setting['これからのコンセプト'] || '';
  if (!concept) {
    return 'この1週間で、仕事中に「これは書ける」と思った出来事を1つ教えてください。';
  }

  var user = [
    'あなたは、書き手から一次情報を引き出すインタビュアーです。',
    '',
    '# 書き手のコンセプト',
    concept,
    '',
    answered.length ? ('# すでに答えた質問（重複させない）\n' + answered.slice(-30).join('\n')) : '',
    '',
    '# 依頼',
    'この書き手しか答えられない質問を、1つだけ作ってください。',
    '条件:',
    '- 一般論ではなく、実際にあった出来事・数字・言われた言葉を引き出す質問にする',
    '- 抽象的な問い（「どう思いますか」など）にしない',
    '- 1文で、答えるのに1分かからない質問にする',
    '',
    '質問文だけを出力してください。前置きも記号も付けないでください。'
  ].filter(String).join('\n');

  return xClaude_({ userText: user, maxTokens: 1000, effort: 'low' }).trim();
}

/**
 * 溜まっている一次情報を、生成プロンプト用のテキストにする。
 */
function xReadFacts_(limit) {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var rows = values.filter(function (r) { return String(r[3]).trim(); });
  if (!rows.length) return '';

  rows.reverse();                       // 新しいものを優先
  if (limit) rows = rows.slice(0, limit);

  return rows.map(function (r) {
    return '- ' + (r[1] ? '【' + r[1] + '】' : '') + String(r[2]).trim() + '\n  → ' + String(r[3]).trim();
  }).join('\n');
}

/**
 * 既存の「メイン」シートに残っている回答を、X_一次情報 に取り込む。
 * 業者さんの仕組みで答えたものを引き継ぐための一回限りの処理。
 */
function xImportMainAnswers() {
  var sh = xBook_().getSheetByName('メイン');
  if (!sh || sh.getLastRow() < 2) { xToast_('「メイン」シートに取り込めるものがありませんでした。'); return 0; }

  // B=ジャンル, C=質問, D=回答（業者さんのスクリプトの並び）
  var values = sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues();
  var dst = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var already = xAnsweredQuestions_();

  var added = 0;
  values.forEach(function (r) {
    var genre = String(r[0] || '').trim();
    var q = String(r[1] || '').trim();
    var a = String(r[2] || '').trim();
    if (!a) return;
    if (q && already.indexOf(q) >= 0) return;
    dst.appendRow(['(メインから取込)', genre, q, a, 0]);
    added++;
  });

  xToast_(added + '件を X_一次情報 に取り込みました。');
  return added;
}

/* ============================================================
 * 既存の「質問リスト」シートの取り込み
 *
 * 業者さんのシートは、1つの表に性質の違うものが混ざっている。
 *   ・質問だけあって回答が空の行      → まだ答えていない質問
 *   ・短い回答が入っている行          → 一次情報
 *   ・長文（完成した投稿）が入っている行 → 文体サンプル
 * これを仕分けて、それぞれの使い道に振り分ける。
 * ============================================================ */

/** これ以上の長さなら「完成した投稿」とみなす */
var X_SAMPLE_MIN_LEN = 200;

/**
 * 質問リストシートを読み、3つのシートに仕分ける。
 * 何度実行しても重複しない。
 */
function xImportQuestionSheet() {
  var ss = xBook_();
  var sh = null;
  for (var i = 0; i < X_QLIST_NAMES.length; i++) {
    sh = ss.getSheetByName(X_QLIST_NAMES[i]);
    if (sh) break;
  }
  if (!sh || sh.getLastRow() < 2) {
    xToast_('「質問リスト」シートが見つかりませんでした。');
    return;
  }

  var lastCol = Math.max(5, sh.getLastColumn());
  var values = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();

  // 見出し行を探す（「質問」を含む行）
  var headRow = 0;
  for (var r = 0; r < Math.min(values.length, 15); r++) {
    var joined = values[r].join('|');
    if (joined.indexOf('質問') >= 0 && joined.indexOf('回答') >= 0) { headRow = r; break; }
  }

  var factSh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var sampleSh = xSheet_(X_SHEETS.SAMPLE, ['取込日', '出所', '本文']);
  var qSh = xSheet_(X_SHEETS.QSTOCK, ['ジャンル', '質問', '答えた']);

  var knownFacts = xAnsweredQuestions_();
  var knownSamples = xExistingSamples_();
  var knownQs = xExistingQuestions_();

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var addFact = 0, addSample = 0, addQ = 0;

  for (var r = headRow + 1; r < values.length; r++) {
    var genre = String(values[r][1] || '').trim();
    var question = String(values[r][2] || '').trim();
    var answer = String(values[r][3] || '').trim();
    var extra = String(values[r][4] || '').trim();   // DIL投稿など5列目

    if (!question && !answer && !extra) continue;

    // 長文は完成した投稿とみなして、文体サンプルへ
    [answer, extra].forEach(function (txt) {
      if (txt.length >= X_SAMPLE_MIN_LEN && knownSamples.indexOf(txt.slice(0, 80)) < 0) {
        sampleSh.appendRow([today, '質問リスト(' + (genre || question || '') + ')', txt]);
        knownSamples.push(txt.slice(0, 80));
        addSample++;
      }
    });

    // 短い回答は一次情報へ
    if (answer && answer.length < X_SAMPLE_MIN_LEN && question &&
        knownFacts.indexOf(question) < 0) {
      factSh.appendRow([today, genre, question, answer, 0]);
      knownFacts.push(question);
      addFact++;
    }
    // 5列目が短文で、回答が空なら、それも一次情報として拾う
    if (!answer && extra && extra.length < X_SAMPLE_MIN_LEN && question &&
        knownFacts.indexOf(question) < 0) {
      factSh.appendRow([today, genre, question, extra, 0]);
      knownFacts.push(question);
      addFact++;
    }

    // 回答が空の質問は、未回答ストックへ
    if (question && !answer && !extra && knownQs.indexOf(question) < 0) {
      qSh.appendRow([genre, question, '']);
      knownQs.push(question);
      addQ++;
    }
  }

  sampleSh.setColumnWidth(3, 560);
  if (sampleSh.getLastRow() > 1) sampleSh.getRange(2, 3, sampleSh.getLastRow() - 1, 1).setWrap(true);
  factSh.setColumnWidth(4, 480);
  qSh.setColumnWidth(2, 560);
  if (qSh.getLastRow() > 1) qSh.getRange(2, 2, qSh.getLastRow() - 1, 1).setWrap(true);

  var msg = '取り込みました。 一次情報 ' + addFact + '件 / 文体サンプル ' + addSample +
            '件 / 未回答の質問 ' + addQ + '件';
  Logger.log(msg);
  xToast_(msg);
}

function xExistingSamples_() {
  var sh = xBook_().getSheetByName(X_SHEETS.SAMPLE);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).slice(0, 80); }).filter(String);
}

function xExistingQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.QSTOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(String);
}

/** 文体サンプルを読む（長いものを優先） */
function xReadSamples_(n) {
  var sh = xBook_().getSheetByName(X_SHEETS.SAMPLE);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (s) { return s.length >= X_SAMPLE_MIN_LEN; });
  rows.sort(function (a, b) { return b.length - a.length; });
  return rows.slice(0, n || 3);
}

/**
 * 「今週あったこと」のメモを読む（直近14日ぶん、新しい順に最大10件）。
 * 過去の棚卸しより新しい出来事のほうが、新しい視点の素になる。
 */
function xReadThisWeekNotes_() {
  return xThisWeekNoteList_().map(function (n) {
    return '- [' + n.no + '] ' + n.text;
  }).join('\n');
}

/**
 * 「今週あったこと」を M1, M2 … の番号つきで返す。
 * 週の編集で、1件ずつ別の枠の材料に割り当てられるようにするため。
 * @return {Array<Object>} [{ no:'M1', text }]
 */
function xThisWeekNoteList_() {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];

  var limit = new Date();
  limit.setDate(limit.getDate() - 14);
  limit.setHours(0, 0, 0, 0);

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var rows = values.filter(function (r) {
    if (String(r[1]).trim() !== '今週あったこと' || !String(r[3]).trim()) return false;
    var d = xParseDate_(r[0]);
    return !d || d >= limit;
  });

  return rows.slice(-10).reverse().map(function (r, i) {
    return { no: 'M' + (i + 1), text: String(r[3]).trim() };
  });
}

// ===== 17_XStrategy.js =====

/**
 * 17_XStrategy.js
 * 発信設計書の読み込み
 *
 * 業者さんのヒアリングシート・戦略シートには、
 *   ・発信の目的 / ターゲット4層 / ペイン / 反応するキーワード / 抱かせる感情
 *   ・独自性 / 他社にない価値 / タグライン
 *   ・ミッション / ビジョン / 創業ストーリー / 仮想敵 / 一人称
 * が揃っている。これはそのまま生成の土台になる。
 *
 * 転記させると抜けるので、シートを丸ごとテキストとして読む。
 */

/** 読み込むシート名の既定候補 */
var X_STRATEGY_DEFAULTS = ['コンセプト', 'アカウント設計', '戦略', 'ヒアリング', '設計', '目標達成', '運用マニュアル'];
var X_FACTSHEET_DEFAULTS = ['インタビュー', '年表', 'メイン'];
var X_SAMPLESHEET_DEFAULTS = ['サンプル投稿', '固定ポスト'];

/** 1シートから読む最大文字数（プロンプトが膨らみすぎないように） */
var X_STRATEGY_MAX = 12000;

/**
 * 指定したシート群を、丸ごとテキストとして読む。
 * 行の形がシートごとにバラバラなので、表として解釈せず、
 * 空でないセルをつないで素のテキストにする。取りこぼしが出ない。
 *
 * @param {Array<string>} names シート名
 * @param {number} maxPerSheet 1シートあたりの最大文字数
 */
function xReadSheetsAsText_(names, maxPerSheet) {
  var ss = xBook_();
  var out = [];
  (names || []).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;

    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var lines = [];
    values.forEach(function (row) {
      var cells = row.map(function (v) {
        return String(v === null || v === undefined ? '' : v).trim();
      }).filter(String);
      if (cells.length) lines.push(cells.join('　／　'));
    });

    var text = lines.join('\n');
    var cap = maxPerSheet || X_STRATEGY_MAX;
    if (text.length > cap) text = text.slice(0, cap) + '\n…（以下省略）';
    if (text) out.push('## ' + name + '\n' + text);
  });
  return out.join('\n\n');
}

/**
 * 設定からシート名のリストを得る。
 * 設定が空なら、既定候補に部分一致するシートを探す。
 * 「(2026.10-)」のような新しい版があれば、そちらを優先する。
 */
function xResolveSheetNames_(settingKey, defaults) {
  var setting = xReadSetting_();
  var names = String(setting[settingKey] || '')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);
  if (names.length) return names;

  var all = xBook_().getSheets().map(function (s) { return s.getName(); });
  var hit = all.filter(function (n) {
    return defaults.some(function (d) { return n.indexOf(d) >= 0; });
  });

  // 「コンセプト」と「コンセプト(2026.10-)」が両方ある場合、新しい方だけ使う
  var dropped = {};
  hit.forEach(function (a) {
    hit.forEach(function (b) {
      if (a !== b && b.indexOf(a) === 0 && b.length > a.length) dropped[a] = true;
    });
  });
  return hit.filter(function (n) { return !dropped[n]; });
}

/**
 * 戦略シートを読み、1つのテキストにする。
 * X_設定 の「戦略シート名」（カンマ区切り）で指定。空なら既定候補から探す。
 */
function xReadStrategy_() {
  return xReadSheetsAsText_(xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS), X_STRATEGY_MAX);
}

/** インタビュー・年表・メインなどを、一次情報として丸ごと読む */
function xReadFactSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS), 10000);
}

/** サンプル投稿・固定ポストを、文体サンプルとして丸ごと読む */
function xReadSampleSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS), 10000);
}

/**
 * 読み込めているか確認する（実行してログを見る）。
 */
function xPreviewStrategy() {
  var strategy = xReadStrategy_();
  var facts = xReadFactSheets_();
  var samples = xReadSampleSheets_();

  Logger.log('発信設計書 : ' + strategy.length + '文字  ' +
    xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS).join(' / '));
  Logger.log('一次情報   : ' + facts.length + '文字  ' +
    xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS).join(' / '));
  Logger.log('文体サンプル: ' + samples.length + '文字  ' +
    xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS).join(' / '));

  var text = strategy;
  if (!text) {
    xToast_('戦略シートが見つかりませんでした。X_設定の「戦略シート名」にシート名を入れてください。');
    Logger.log('戦略シートが見つかりません。このブックのシート: ' +
      xBook_().getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return 0;
  }
  Logger.log('読み込んだ文字数: ' + text.length);
  Logger.log('--- 先頭1500字 ---');
  Logger.log(text.slice(0, 1500));
  xToast_('設計書' + strategy.length + '字 / 一次情報' + facts.length +
          '字 / サンプル' + samples.length + '字 を読み込みました。ログを確認してください。');
  return text.length;
}

/**
 * 週の中でターゲット層をどう配分するか。
 * 新規接点をつくる段階なので、潜在層を厚く、明確層（相談導線）を1本だけ置く。
 */
function xLayerPlan_(count) {
  var base = ['潜在層', '潜在層', '潜在層', '準顕在層', '準顕在層', '顕在層', '明確層'];
  var out = [];
  for (var i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}


/**
 * サンプル投稿・固定ポストのシートから、投稿を1本ずつ取り出す。
 *
 * xReadSampleSheets_() はシートを丸ごと1つのテキストにするが、
 * 型の分析には「1本ずつ」の形が要る。
 * セル単位で読み、十分な長さのものを1投稿として扱う。
 *
 * @param {number} minLen これ以上の長さを投稿とみなす
 * @return {Array<string>} 新しいほうが先（シートの下にあるものを先頭に）
 */
function xReadSampleSheetPosts_(minLen) {
  minLen = minLen || 150;
  var names = xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS);
  var ss = xBook_();
  var out = [];

  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;
    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();

    // 下の行ほど新しいとみなして、後ろから拾う
    for (var r = values.length - 1; r >= 0; r--) {
      for (var c = 0; c < values[r].length; c++) {
        var v = String(values[r][c] === null || values[r][c] === undefined ? '' : values[r][c]).trim();
        if (v.length >= minLen) out.push(v);
      }
    }
  });
  return out;
}

// ===== 18_XPattern.js =====

/**
 * 18_XPattern.js
 * 型カタログ
 *
 * 過去の投稿から「構成の型」を複数取り出す。
 *
 * 文体ルールだけだと、同じ骨組みの投稿が並んでしまう。
 * 内容を変えても形が同じだと、読む側には「前と同じ」に見える。
 * そこで型を複数持たせ、週の中で散らす。
 */

/** 型を何種類取り出すか */
var X_PATTERN_COUNT = 8;

/** 分析に使う投稿の本数 */
var X_PATTERN_SAMPLES = 20;

/**
 * 過去の投稿から型を取り出して X_型カタログ に書く。
 */
function xExtractPatterns() {
  var posts = xPickPatternSamples_(X_PATTERN_SAMPLES);
  if (posts.length < 5) {
    throw new Error('分析できる投稿が足りません（' + posts.length + '本）。先に xPreviewLog で読み取りを確認してください。');
  }

  var items = posts.map(function (t, i) {
    return '--- 投稿' + (i + 1) + ' ---\n' + t;
  }).join('\n\n');

  var catList = X_CATEGORIES.map(function (c) {
    return '・' + c.name + '（' + c.desc + '）';
  }).join('\n');

  var system = [
    'あなたは日本語の文章構成を分析する専門家です。',
    '与えられるのは、同じ書き手の名前で出された投稿です。',
    '',
    '注意：この中には、外部ライターが作った事実でない内容が混ざっています。',
    '内容の真偽は見ないでください。見るのは骨組みだけです。',
    '',
    '目的は「構成の型」を複数取り出すことです。',
    'この書き手が無意識に使い分けている骨組みを、違いが分かる形で分けてください。',
    '',
    '守ること:',
    '・似た型をまとめないでください。違いが出るように分けてください',
    '・この書き手が「使わない」と決めているものを、型の説明に入れないでください。',
    '  使わないもの（後述の禁止リスト）に当たる書き方は、型として採用しないでください。',
    '・一般的な文章構成の教科書を書かないでください。この投稿群にある型だけを書いてください',
    '・先に出てくる投稿ほど新しく、いまの発信の軸に近いものです。',
    '  古い投稿にしか無い型より、新しい投稿にある型を優先して拾ってください',
    '・骨組みは「何行目に何を置くか」ではなく「どういう順で読者を動かすか」で書いてください',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var rules = '';
  try { rules = xReadRules_(); } catch (e) { rules = ''; }

  var user = [
    '以下の投稿から、構成の型を' + X_PATTERN_COUNT + '種類に分けてください。',
    '',
    (rules ? ('--- この書き手の禁止リスト（これに当たる書き方は型にしない） ---\n' + rules + '\n') : ''),
    items,
    '',
    '--- 投稿の分類（この型がどれに向くかを選ぶ） ---',
    catList,
    '',
    '--- 出力形式 ---',
    '{"patterns":[{',
    '  "型名": "10字以内。この型を一言で",',
    '  "骨組み": ["順に3〜6段階。各20字以内"],',
    '  "向いている分類": ["上の分類から1〜3つ"],',
    '  "冒頭の作り方": "1行目をどう始めるか。20字以内",',
    '  "締め方": "最後の一文をどう置くか。20字以内",',
    '  "この型が効く理由": "30字以内"',
    '}]}'
  ].join('\n');

  var json = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 12000, effort: 'high'
  }));

  xWritePatterns_(json.patterns || []);
  xToast_((json.patterns || []).length + '種類の型を X_型カタログ に書き出しました。');
  return (json.patterns || []).length;
}

/**
 * 分析用の投稿を拾う。
 *
 * 【重要】新しい投稿を優先する。
 * 古い投稿は外部ライターの雛形がもとになっており、その型を学ぶと
 * うまくいかなかった形を再生産してしまう。
 * 直近で手応えのあった投稿のほうが、いまの軸に近い。
 */
function xPickPatternSamples_(n) {
  var out = [];
  var seen = {};

  function add(t) {
    t = String(t || '').trim();
    if (t.length < 150) return;
    var key = t.slice(0, 60);
    if (seen[key]) return;
    seen[key] = true;
    out.push(t);
  }

  // 1. サンプル投稿・固定ポストのシート（今週分を足してもらう場所。最優先）
  //    ここが一番新しく、実際に手応えのあった投稿が入る。
  xReadSampleSheetPosts_(150).slice(0, 10).forEach(add);

  // 2. 取り込み済みの文体サンプルシートがあれば、それも
  xReadSamples_(4).forEach(add);

  var rows;
  try { rows = xReadLog_(); } catch (e) { rows = []; }
  var texts = rows.map(function (r) {
    return String(r['実投稿'] || r['雛形'] || '').trim();
  }).filter(function (t) { return t.length >= 150; });

  // 3. 過去ログの直近ぶん（新しい順）
  for (var i = texts.length - 1; i >= 0 && out.length < n - 4; i--) add(texts[i]);

  // 4. 残り枠で、古いほうからも少しだけ（型の幅を見るため）
  var step = Math.max(1, Math.floor(texts.length / 4));
  for (var j = 0; j < texts.length && out.length < n; j += step) add(texts[j]);

  return out.slice(0, n);
}

/** 型カタログをシートに書く（手で直せる形） */
function xWritePatterns_(patterns) {
  var sh = xSheet_(X_SHEETS.PATTERN,
    ['型名', '骨組み', '向いている分類', '冒頭の作り方', '締め方', '効く理由', '使わない']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }
  if (!patterns.length) return;

  var rows = patterns.map(function (p) {
    return [
      p['型名'] || '',
      (p['骨組み'] || []).join('\n↓\n'),
      (p['向いている分類'] || []).join('、'),
      p['冒頭の作り方'] || '',
      p['締め方'] || '',
      p['この型が効く理由'] || '',
      ''
    ];
  });
  sh.getRange(2, 1, rows.length, 7).setValues(rows);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(6, 240);
  sh.getRange(2, 1, rows.length, 7).setWrap(true).setVerticalAlignment('top');
}

/**
 * 型カタログを読む。「使わない」に何か書いてある行は除く。
 */
function xReadPatterns_() {
  var sh = xBook_().getSheetByName(X_SHEETS.PATTERN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  return values
    .filter(function (r) { return String(r[0]).trim() && !String(r[6]).trim(); })
    .map(function (r) {
      return {
        name: String(r[0]).trim(),
        frame: String(r[1]).trim(),
        cats: String(r[2]).trim(),
        open: String(r[3]).trim(),
        close: String(r[4]).trim(),
        why: String(r[5]).trim()
      };
    });
}

/** 生成プロンプト用のテキストにする */
function xPatternsText_() {
  var list = xReadPatterns_();
  if (!list.length) return '';
  return list.map(function (p, i) {
    return [
      '【型' + (i + 1) + '：' + p.name + '】',
      '骨組み: ' + p.frame.replace(/\n/g, ' '),
      '向く分類: ' + p.cats,
      '冒頭: ' + p.open,
      '締め: ' + p.close
    ].join('\n');
  }).join('\n\n');
}

// ===== 19_XWeek.js =====

/**
 * 19_XWeek.js
 * 週の傾向（紫微斗数で決めた、その日に向く投稿の種類）
 *
 * 計算はしない。本人が星を見て決めた結論だけを受け取る。
 * 本文の分類と締めの分類を分けて持つ（同じ内容でも締めで宮が変わるため）。
 */

/**
 * X_週の傾向 シートを作る（翌日から7日分の枠を用意する）。
 */
function xSetupWeekPlan() {
  var sh = xSheet_(X_SHEETS.WEEKPLAN,
    ['日付', '長さ', '本文の分類', '締めの分類', '投稿時刻', '回る人数', 'メモ']);

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var wdays = ['日', '月', '火', '水', '木', '金', '土'];
  // 週は月曜始まり。次の月曜からの7日分を用意する。
  var base = new Date();
  var add = (8 - base.getDay()) % 7;
  if (add === 0) add = 7;
  base.setDate(base.getDate() + add);

  var rows = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    // 週2本を長文にする。間隔があくように3日目と6日目へ。
    var len = (i === 2 || i === 5) ? '長文' : '短文';
    rows.push([
      Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') +
        '（' + wdays[d.getDay()] + '）',
      len, '', '', '', '', ''
    ]);
  }
  sh.getRange(2, 1, rows.length, 7).setValues(rows);

  // 長さをプルダウンにする
  var lenRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['長文', '短文'], true).setAllowInvalid(true).build();
  sh.getRange(2, 2, rows.length, 1).setDataValidation(lenRule);

  // 分類をプルダウンにする
  var names = X_CATEGORIES.map(function (c) { return c.name; });
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true).setAllowInvalid(true).build();
  sh.getRange(2, 3, rows.length, 2).setDataValidation(rule);

  // 分類の意味を右側に添えておく
  var legend = [['', '', '', '', '', '', '']];
  legend.push(['── 分類 ──', '中身', '宮', '', '', '', '']);
  X_CATEGORIES.forEach(function (c) {
    legend.push([c.name, c.desc, c.palace, '', '', '', '']);
  });
  legend.push(['', '', '', '', '', '', '']);
  legend.push(['── 長さ ──', '長文=じっくり書く / 短文=1つの主張を短く（長文の言い直しはしない）', '', '', '', '', '']);
  sh.getRange(rows.length + 2, 1, legend.length, 7).setValues(legend);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 120);

  xToast_('X_週の傾向 を作りました。本文の分類を埋めてください（締めは空でもOK）。');
}

/**
 * 週の傾向を読む。
 * @return {Array<{date,cat,closeCat,time,people,memo}>}
 */
function xReadWeekPlan_() {
  var sh = xBook_().getSheetByName(X_SHEETS.WEEKPLAN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var date = String(values[i][0]).trim();
    if (!date || date.indexOf('──') >= 0) break;   // 凡例に入ったら終わり
    var len = String(values[i][1]).trim();
    var cat = String(values[i][2]).trim();
    if (!cat && !len) continue;                     // 何も指定がない日は飛ばす
    out.push({
      date: date,
      len: len || '長文',
      cat: cat,
      closeCat: String(values[i][3]).trim() || cat,
      time: String(values[i][4]).trim(),
      people: String(values[i][5]).trim(),
      memo: String(values[i][6]).trim()
    });
  }
  return out;
}

/** 分類名から、対応する読者の温度を引く */
function xLayerOf_(catName) {
  for (var i = 0; i < X_CATEGORIES.length; i++) {
    if (X_CATEGORIES[i].name === catName) return X_CATEGORIES[i].layer;
  }
  return '';
}

/** 生成プロンプト用のテキストにする */
function xWeekPlanText_() {
  var plan = xReadWeekPlan_();
  if (!plan.length) return '';

  var lines = plan.map(function (p, i) {
    var parts = [(i + 1) + '本目（' + p.date + '）: ' + (p.len || '長文') +
                 (p.cat ? ' / 本文=' + p.cat : '')];
    if (p.closeCat !== p.cat) parts.push('締め=' + p.closeCat);
    var layer = xLayerOf_(p.cat);
    if (layer) parts.push('読者の温度=' + layer);
    if (p.memo) parts.push('メモ=' + p.memo);
    return '  ' + parts.join(' / ');
  });
  return lines.join('\n');
}

/* ============================================================
 * 反応ログ
 *
 * 引用ポスト、もらったコメント、自分の返信を溜める。
 *
 * インタビューや年表は「自分の内側」の棚卸しなので、
 * そこからだけ書くと内側で完結した話しか出ない。
 * 他人の言葉は、自分では思いつかない角度をそのまま持ち込む。
 * ============================================================ */

/** 反応ログの種類 */
var X_REACTION_KINDS = [
  '自分の投稿',
  '引用した相手の投稿',
  'もらったコメント',
  '自分の返信',
  'DMでのやりとり',
  '対面で言われたこと',
  '参考になった他人の投稿'   // 論点だけ借りる。表現と事例は使わない
];

/**
 * X_反応ログ シートを作る。
 */
function xSetupReactionLog() {
  var sh = xSheet_(X_SHEETS.REACTION, ['日付', '種類', '内容', '誰の言葉か', '気づいたこと']);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(X_REACTION_KINDS, true).setAllowInvalid(true).build();
  sh.getRange(2, 2, 200, 1).setDataValidation(rule);

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 520);
  sh.setColumnWidth(5, 280);
  sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setWrap(true);
  sh.getRange(2, 5, sh.getMaxRows() - 1, 1).setWrap(true);

  xToast_('X_反応ログ を作りました。引用ポストやコメントを貼ってください。');
}

/**
 * 反応ログを、生成プロンプト用のテキストにする。
 * @param {number} limit 新しいほうから何件か
 */
function xReadReactions_(limit) {
  var sh = xBook_().getSheetByName(X_SHEETS.REACTION);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  var rows = values.filter(function (r) { return String(r[2]).trim(); });
  if (!rows.length) return '';

  rows.reverse();
  if (limit) rows = rows.slice(0, limit);

  return rows.map(function (r) {
    var parts = [];
    var head = '- 【' + (String(r[1]).trim() || '記録') + '】';
    var d = r[0] ? xParseDate_(r[0]) : null;
    if (d) head += ' ' + Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    if (r[3]) head += '（' + String(r[3]).trim() + '）';
    parts.push(head);
    parts.push('  ' + String(r[2]).trim().replace(/\n/g, '\n  '));
    if (r[4]) parts.push('  → 気づいたこと: ' + String(r[4]).trim());
    return parts.join('\n');
  }).join('\n');
}

// ===== 20_XCheck.js =====

/**
 * 20_XCheck.js
 * 投稿案の自動チェック
 *
 * 7本を全部読むのをやめるための仕組み。
 * 機械的に照合できることは機械にやらせ、人は赤くなった箇所だけ見る。
 *
 * APIは使わない（文字列の照合だけ）ので、一瞬で終わる。
 */

/**
 * X_投稿案 の未チェック分を検査し、結果を書き込む。
 * 問題があった行には色を付ける。
 */
function xCheckDrafts() {
  var sh = xBook_().getSheetByName(X_SHEETS.DRAFT);
  if (!sh || sh.getLastRow() < 2) {
    xToast_('X_投稿案 がありません。先に投稿案を作ってください。');
    return;
  }
  // 古い列順のまま検査すると別の列を本文と見なしてしまうので、先に直す
  xRepairHeaders_(sh, X_DRAFT_HEADERS);

  var banned = xBannedWords_();
  var known = xKnownFactsText_();
  var setting = xReadSetting_();
  var landings = xSettingLines_(setting, '禁止する着地', X_DEFAULT_BANNED_LANDINGS);
  var episodes = xSettingLines_(setting, '使用禁止のエピソード', X_DEFAULT_BANNED_EPISODES);

  var lastRow = sh.getLastRow();
  var bodyCol = xDraftCol_('本文');
  var checkCol = xDraftCol_('自己チェック');
  var bodies = sh.getRange(2, bodyCol, lastRow - 1, 1).getValues();
  var stamps = sh.getRange(2, xDraftCol_('作成日時'), lastRow - 1, 1).getValues();
  var latestStamp = String(stamps[stamps.length - 1][0]);
  var systemCount = 0;

  // 誘導（サービス紹介・固定ポストなど）は週に1本まで。今回の生成分で数える。
  var promoRows = [];
  for (var pi = 0; pi < bodies.length; pi++) {
    if (String(stamps[pi][0]) !== latestStamp) continue;
    var pb = String(bodies[pi][0] || '');
    if (X_PROMO_WORDS.some(function (w) { return pb.indexOf(w) >= 0; })) promoRows.push(pi);
  }

  var results = [];
  var ngRows = [];
  // 報告に出す数は、直近の1回ぶんだけで数える（過去の行まで数えると今週の数に見えてしまう）
  var ngLatest = 0;
  var quotedLatest = 0;

  for (var i = 0; i < bodies.length; i++) {
    var body = String(bodies[i][0] || '');
    if (!body.trim()) { results.push(['']); continue; }

    var problems = [];

    // 1) 禁止語
    var hits = banned.filter(function (w) { return body.indexOf(w) >= 0; });
    if (hits.length) problems.push('禁止語: ' + hits.join('、'));

    // 2) 一次情報に見当たらない数字
    var unknownNums = xUnknownNumbers_(body, known);
    if (unknownNums.length) problems.push('出どころ未確認の数字: ' + unknownNums.join('、'));

    // 3) 禁止した着地・使わないと決めたエピソード
    var land = landings.filter(function (w) { return body.indexOf(w) >= 0; });
    if (land.length) problems.push('禁止した着地: ' + land.join('、'));
    var epi = episodes.filter(function (w) { return body.indexOf(w) >= 0; });
    if (epi.length) problems.push('使わないエピソード: ' + epi.join('、'));

    // 締めが「仕組み」の投稿を数える（今回の生成分だけ。週で2本まで）
    if (String(stamps[i][0]) === latestStamp) {
      var tail = body.trim().split('\n').slice(-3).join('');
      if (tail.indexOf('仕組み') >= 0) systemCount++;
    }

    // 誘導が週2本以上なら、その本すべてに印を付ける
    if (promoRows.length > 1 && promoRows.indexOf(i) >= 0) {
      problems.push('誘導が週' + promoRows.length + '本（1本まで）');
    }

    // 4) 【要確認：…】が残っていないか
    //    元の投稿が分からないときにAIが入れる印。そのまま投稿できない。
    var asks = body.match(/【要確認[^】]*】/g);
    if (asks) problems.push('本文に【要確認】が残っている（質問は別欄に）: ' + asks.join('、'));

    // 5) 冒頭がカギカッコで始まっていないか（週で2本までの確認用）
    var head = body.split('\n')[0].trim();
    var quoted = /^[「『]/.test(head);

    var text = problems.length ? ('⚠ ' + problems.join(' / ')) : 'OK';
    if (quoted) text += '（冒頭カギカッコ）';

    results.push([text]);
    if (problems.length) ngRows.push(i + 2);
    if (String(stamps[i][0]) === latestStamp) {
      if (problems.length) ngLatest++;
      if (quoted) quotedLatest++;
    }
  }

  sh.getRange(2, checkCol, results.length, 1).setValues(results);

  // 【要確認】が残っている原稿は完成稿として扱わない。「状態」を合わせる。
  // 本人が付けた状態（残す・済 など）は触らず、「未」と「要確認」だけ切り替える。
  var stateCol = xDraftCol_('状態');
  var states = sh.getRange(2, stateCol, lastRow - 1, 1).getValues();
  var changed = false;
  for (var si = 0; si < states.length; si++) {
    var st = String(states[si][0]).trim();
    var hasAsk = /【要確認/.test(String(bodies[si][0] || ''));
    if (st === '未' && hasAsk) { states[si][0] = '要確認'; changed = true; }
    else if (st === '要確認' && !hasAsk) { states[si][0] = '未'; changed = true; }
  }
  if (changed) sh.getRange(2, stateCol, states.length, 1).setValues(states);
  sh.getRange(2, checkCol, results.length, 1).setBackground(null);
  ngRows.forEach(function (r) { sh.getRange(r, checkCol).setBackground('#fdeceb'); });

  var msg = ngLatest
    ? ('今回の分のうち' + ngLatest + '本に要確認があります。「自己チェック」列の赤い行だけ見てください。')
    : '今回の分は全部OKでした。';
  if (quotedLatest > 2) msg += ' / カギカッコ始まりが' + quotedLatest + '本あります（目安は2本まで）';
  if (systemCount > 2) msg += ' / 「仕組み」で締めた投稿が' + systemCount + '本あります（2本まで）';
  if (promoRows.length > 1) msg += ' / 誘導の入った投稿が' + promoRows.length + '本あります（1本まで）';

  Logger.log(msg);
  xToast_(msg);
  return ngLatest;
}

/** 文体ルールの禁止語を配列で取り出す */
function xBannedWords_() {
  var sh = xBook_().getSheetByName(X_SHEETS.RULE);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim();
    if (key !== '禁止語' && key !== 'やってはいけないこと') continue;
    String(values[r][1]).split('\n').forEach(function (w) {
      w = w.trim();
      // 1〜2字の語や、文章になっているものは誤検出するので外す
      if (w.length >= 3 && w.length <= 20 && w.indexOf('。') < 0) out.push(w);
    });
  }
  return out;
}

/** 事実の出どころになる文章を、1つにまとめて返す */
function xKnownFactsText_() {
  var parts = [];
  try { parts.push(xReadFactSheets_()); } catch (e) {}
  try { parts.push(xReadFacts_(200)); } catch (e) {}
  try { parts.push(xReadStrategy_()); } catch (e) {}
  try { parts.push(xReadReactions_(200)); } catch (e) {}
  return parts.filter(String).join('\n');
}

/**
 * 本文に出てくる数字のうち、一次情報の中に見当たらないものを返す。
 *
 * 「14歳」が「30代」に書き換わるような事故を見つけるための検査。
 * 日付や箇条書きの番号は対象外にする。
 */
function xUnknownNumbers_(body, known) {
  if (!known) return [];

  var out = [];
  var seen = {};

  // 数字＋単位（年/歳/件/人/回/分/時間/日/ヶ月/万/円/%）を拾う
  var re = /([0-9０-９]{1,6})\s*(年間|年|歳|件|人|回|分|時間|日|ヶ月|か月|万|円|%|％|割)/g;
  var m;
  while ((m = re.exec(body)) !== null) {
    var num = xToHalf_(m[1]);
    var unit = m[2];
    var token = num + unit;
    if (seen[token]) continue;
    seen[token] = true;

    // 箇条書きの番号や、1〜3の小さい数はノイズになりやすいので除く
    if (Number(num) <= 3 && (unit === '件' || unit === '人' || unit === '回' || unit === '分')) continue;

    // 一次情報の中に「数字＋単位」か、数字だけでも出てくれば良しとする
    if (known.indexOf(token) >= 0) continue;
    if (known.indexOf(num + ' ' + unit) >= 0) continue;
    if (known.indexOf(num) >= 0) continue;

    out.push(token);
  }
  return out;
}

/** 全角数字を半角に */
function xToHalf_(s) {
  return String(s).replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
}

// ===== 21_XAnalytics.js =====

/**
 * 21_XAnalytics.js
 * アナリティクスCSVの取り込み
 *
 * 狙いは2つ。
 *
 * 1) 自分の返信を一次情報として拾う
 *    普段のやり取りで書いている返信は、投稿用に整えていない素の言葉。
 *    相手の文脈に反応して書いているので、自分では思いつかない角度が入る。
 *    毎日書いているので、追加の手間なしで素材が溜まる。
 *
 * 2) 反応の数字を貯める
 *    型ごとの当たり外れを見るのは、母数が溜まってから。
 *    それまでは貯めるだけ。
 *
 * ※CSVの「ポスト本文」は約150字で切られている。
 *   投稿の特定には使えるが、本文の長さの判断には使えない。
 */

/** CSVの列名（Xのアナリティクスの書き出し） */
var X_CSV_COLS = {
  id: 'ポストID', date: '日付', body: 'ポスト本文', link: 'ポストのリンク',
  imp: 'インプレッション数', like: 'いいね', eng: 'エンゲージメント',
  bookmark: 'ブックマーク', share: '共有された回数', follow: '新しいフォロー',
  reply: '返信', repost: 'リポスト', profile: 'プロフィールへのアクセス数'
};

/** これ以上の長さの返信を、一次情報として拾う（相槌を除くため） */
var X_REPLY_MIN_LEN = 60;

/**
 * 取り込み用のシートを作る。ここにCSVを貼ってもらう。
 */
function xSetupAnalyticsSheet() {
  var sh = xSheet_(X_SHEETS.ANALYTICS, []);
  if (sh.getLastRow() === 0) {
    var head = ['ポストID', '日付', 'ポスト本文', 'ポストのリンク', 'インプレッション数',
      'いいね', 'エンゲージメント', 'ブックマーク', '共有された回数', '新しいフォロー',
      '返信', 'リポスト', 'プロフィールへのアクセス数', '詳細のクリック数',
      'URLのクリック数', 'ハッシュタグのクリック数', 'パーマリンクのクリック数', '除外'];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  sh.setColumnWidth(3, 480);

  xToast_('X_反応データ を作りました。アナリティクスのCSVを A1 から貼り付けてください。' +
          '（見出し行ごと貼ってOK。R列「除外」は、互助会で伸びた回に印をつける欄です）');
}

/**
 * 貼り付けたCSVを処理する。
 * ・自分の返信 → X_一次情報 へ
 * ・投稿の数字 → そのまま蓄積（集計は母数が溜まってから）
 */
function xImportAnalytics() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) {
    xToast_('X_反応データ にCSVが貼られていません。');
    return;
  }

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });

  if (ci.body < 0) {
    throw new Error('「ポスト本文」の列が見つかりません。見出し行ごと貼り付けてください。');
  }

  var factSh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var known = xAnsweredQuestions_();

  var posts = 0, replies = 0, added = 0;

  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body) continue;

    var isReply = body.charAt(0) === '@';
    // CSVには引用ポストの印が無い。末尾が t.co のリンクで終わる自分の投稿を、引用とみなす（推定）
    var isQuote = !isReply && /https:\/\/t\.co\/\S+\s*$/.test(body);
    if (isReply) replies++; else posts++;
    if (!isReply && !isQuote) continue;

    // 相手のIDとリンクを外し、短い相槌は捨てる
    var text = body.replace(/^(@\w+\s*)+/, '').trim();
    text = text.replace(/\s*https:\/\/t\.co\/\S+/g, '').trim();
    if (text.length < X_REPLY_MIN_LEN) continue;

    var genre = isReply ? 'Xでの返信' : 'Xでの引用（推定）';
    var key = genre + ': ' + text.slice(0, 30);
    if (known.indexOf(key) >= 0) continue;

    var date = values[r][ci.date] ? String(values[r][ci.date]) : '';
    factSh.appendRow([date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'), genre, key, text, 0]);
    known.push(key);
    added++;
  }

  factSh.setColumnWidth(4, 480);
  if (factSh.getLastRow() > 1) {
    factSh.getRange(2, 4, factSh.getLastRow() - 1, 1).setWrap(true);
  }

  var msg = '投稿' + posts + '件 / 返信' + replies + '件を読みました。' +
            'うち' + added + '件の返信・引用を一次情報に追加しました。';
  Logger.log(msg);
  xToast_(msg);
  return added;
}

/**
 * 反応の状況をざっと見る（集計の判断材料）。
 * 「除外」に印のある行は外す。
 */
function xAnalyticsSummary() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) { xToast_('X_反応データ が空です。'); return; }

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });
  var exCol = head.indexOf('除外');

  function n(row, idx) {
    if (idx < 0) return 0;
    var v = String(row[idx] || '0').replace(/,/g, '');
    var x = parseInt(v, 10);
    return isNaN(x) ? 0 : x;
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body || body.charAt(0) === '@') continue;           // 自分の投稿だけ
    if (exCol >= 0 && String(values[r][exCol] || '').trim()) continue;  // 除外済み
    rows.push(values[r]);
  }
  if (!rows.length) { xToast_('対象の投稿がありません。'); return; }

  var imps = rows.map(function (x) { return n(x, ci.imp); }).sort(function (a, b) { return a - b; });
  var med = imps[Math.floor(imps.length / 2)];
  var repSum = rows.reduce(function (s, x) { return s + n(x, ci.reply); }, 0);
  var folSum = rows.reduce(function (s, x) { return s + n(x, ci.follow); }, 0);

  Logger.log('--- 自分の投稿（除外を抜いた分） ---');
  Logger.log('件数: ' + rows.length);
  Logger.log('インプレッション中央値: ' + med + ' / 最大: ' + imps[imps.length - 1]);
  Logger.log('返信の合計: ' + repSum + ' / 新しいフォローの合計: ' + folSum);

  Logger.log('\n--- 返信が多い順 ---');
  rows.sort(function (a, b) { return n(b, ci.reply) - n(a, ci.reply); });
  rows.slice(0, 10).forEach(function (x) {
    Logger.log('返信' + n(x, ci.reply) + ' 表示' + n(x, ci.imp) +
      ' フォロー' + n(x, ci.follow) + ' | ' + String(x[ci.body]).slice(0, 44));
  });

  Logger.log('\n系統ごとの比較は、メニュー「アナリティクス: 伸びる系統を調べる」で出せます。');
  xToast_(rows.length + '件を集計しました。ログを見てください。');
}


/**
 * 直近の返信・引用を読む。投稿案の主な材料。
 *
 * 「直近」は今日からではなく、取り込んだデータのいちばん新しい日から数える。
 * CSVを書き出した日と生成する日がずれても、最新の1週間を拾えるようにするため。
 *
 * 1件ずつ R1, R2 … の番号を振る。週全体の編集で「どの返信がまだ使われていないか」を
 * 番号で指せるようにするため。
 *
 * @param {number} days 何日ぶん
 * @return {Array<Object>} [{ no:'R1', d:Date|null, kind:'返信'|'引用（推定）', text }]
 */
function xRecentReplyList_(days) {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var rows = values.filter(function (r) {
    return /^Xでの(返信|引用)/.test(String(r[1])) && String(r[3]).trim();
  });
  if (!rows.length) return [];

  var dated = rows.map(function (r) { return { d: xParseDate_(r[0]), r: r }; });
  var latest = null;
  dated.forEach(function (x) { if (x.d && (!latest || x.d > latest)) latest = x.d; });

  var picked;
  if (latest) {
    var from = new Date(latest.getTime() - ((days || 7) - 1) * 24 * 3600 * 1000);
    from.setHours(0, 0, 0, 0);
    picked = dated.filter(function (x) { return x.d && x.d >= from; });
  } else {
    // 日付が読めない場合は、シートの下（新しい側）から拾う
    picked = dated.slice(-20);
  }

  picked.sort(function (a, b) { return (b.d || 0) - (a.d || 0); });
  return picked.map(function (x, i) {
    return {
      no: 'R' + (i + 1),
      d: x.d,
      kind: String(x.r[1]).replace(/^Xでの/, ''),
      text: String(x.r[3]).trim()
    };
  });
}

/** 返信の一覧を、プロンプトに入れる文にする */
function xFormatReplies_(list) {
  return (list || []).map(function (x) {
    var d = x.d ? Utilities.formatDate(x.d, 'Asia/Tokyo', 'M/d') : '';
    return '- [' + x.no + '・' + d + '・' + x.kind + '] ' + x.text;
  }).join('\n');
}

/** 互換用：番号つきの文で返す */
function xReadRecentReplies_(days) {
  return xFormatReplies_(xRecentReplyList_(days));
}

/** 「2026-10-17」「2026/10/17 9:00」「2026年10月17日」などを Date にする。読めなければ null */
function xParseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var s = String(v || '').trim();
  var m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ===== 22_XMining.js =====

/**
 * 22_XMining.js
 * 返信・引用から、新しい論点を発掘する
 *
 * 過去投稿のリライトでは新鮮さが出ない。
 * 自分が他の人に書いた返信には、相手の文脈に反応して出た
 * 「まだ単独投稿にしていない論点」が入っている。
 *
 * 【守るルール】
 *  1. A判定は「結論が過去と違う」ときだけ。テーマが違っても結論が同じならB/C。
 *     無理にAを増やさない。
 *  2. 元コメントより強く言い切らない。
 *     「安心材料になる」を「成功する」に変えるような、根拠のない因果を足さない。
 *  3. 相手の元投稿はデータに無い。何についての発言かを推測で確定しない。
 *  4. 個人・取引先の内部情報を含むものは、公開前の確認対象として印をつける。
 */

/** 1回の呼び出しで分析する返信の数 */
var X_MINE_BATCH = 20;

var X_MINE_CURSOR = 'X_MINE_CURSOR';

/**
 * 返信から論点を発掘して X_企画案 に書く。
 * 件数が多い場合は途中で止まるので、完了まで数回実行する。
 */
function xMineTopics() {
  var started = Date.now();
  var replies = xReplyPool_();
  if (!replies.length) {
    throw new Error('返信が見つかりません。先に「アナリティクス: 取り込む」を実行してください。');
  }

  var sh = xSheet_(X_SHEETS.IDEA,
    ['判定', '企画タイトル', '元の返信（原文）', '日付', '何が新しいか',
     '経営者との接点', '要確認・不明点', '公開前の確認', '採用']);

  var p = PropertiesService.getScriptProperties();
  var cursor = Number(p.getProperty(X_MINE_CURSOR) || 0);
  if (cursor === 0 && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var past = xPastCoverage_();
  var total = replies.length;

  while (cursor < total) {
    if (Date.now() - started > 4.5 * 60 * 1000) {
      p.setProperty(X_MINE_CURSOR, String(cursor));
      xToast_('時間切れで中断しました。' + cursor + ' / ' + total +
              '件まで完了。もう一度実行すると続きから再開します。');
      return;
    }

    var batch = replies.slice(cursor, cursor + X_MINE_BATCH);
    var ideas = [];
    try {
      ideas = xMineBatch_(batch, past);
    } catch (err) {
      Logger.log('この分は飛ばします: ' + err.message);
    }

    if (ideas.length) {
      var rows = ideas.map(function (x) {
        return [
          x['判定'] || '', x['企画タイトル'] || '', x['元の返信'] || '',
          x['日付'] || '', x['何が新しいか'] || '', x['経営者との接点'] || '',
          x['要確認'] || '', x['公開前の確認'] || '', ''
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    }

    cursor += batch.length;
    p.setProperty(X_MINE_CURSOR, String(cursor));
  }

  p.deleteProperty(X_MINE_CURSOR);
  xFormatIdeaSheet_(sh);

  var a = xCountIdeas_(sh, 'A');
  xToast_('発掘が完了しました。A判定 ' + a + '件。X_企画案 の「採用」列に○を入れてください。');
}

/** 発掘をやり直す */
function xResetMining() {
  PropertiesService.getScriptProperties().deleteProperty(X_MINE_CURSOR);
  xToast_('進捗をリセットしました。次回は最初から実行します。');
}

/** 分析対象の返信を集める（一次情報シートの「Xでの返信」） */
function xReplyPool_() {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var out = [];
  values.forEach(function (r) {
    if (String(r[1]).trim() !== 'Xでの返信') return;
    var t = String(r[3]).trim();
    if (t.length < 70) return;
    out.push({ date: String(r[0]).trim(), text: t });
  });
  return out;
}

/** 過去に扱った内容（新規性の判定に使う） */
function xPastCoverage_() {
  var parts = [];

  // 既に出した企画のタイトル
  var ideas = xPastThemes_(40);
  if (ideas.length) parts.push('【過去に生成した投稿のテーマ】\n' + ideas.join('\n'));

  // 文体ルールから「よく書くテーマ」「繰り返している主張」
  try {
    var sh = xBook_().getSheetByName(X_SHEETS.RULE);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      for (var r = 1; r < v.length; r++) {
        var k = String(v[r][0]).trim();
        if (k === 'よく書くテーマ' || k === '繰り返している主張') {
          parts.push('【' + k + '】\n' + String(v[r][1]).trim());
        }
      }
    }
  } catch (e) {}

  // 過去の投稿の書き出し
  try {
    var rows = xReadLog_();
    var heads = rows.slice(-60).map(function (r) {
      return String(r['実投稿'] || r['雛形'] || '').split('\n')[0].slice(0, 50);
    }).filter(String);
    if (heads.length) parts.push('【過去投稿の書き出し】\n' + heads.join('\n'));
  } catch (e) {}

  return parts.join('\n\n');
}

/** 1バッチ分を分析する */
function xMineBatch_(batch, past) {
  var items = batch.map(function (r, i) {
    return '--- 返信' + (i + 1) + '（' + r.date + '）---\n' + r.text;
  }).join('\n\n');

  var system = [
    'あなたは、書き手が他の人に送った返信から、まだ単独投稿にしていない論点を見つける編集者です。',
    '',
    '■ 絶対に守ること',
    '',
    '1. 元コメントより強く言い切らないでください。',
    '   「〜だったりします」を「〜する」に変えない。',
    '   「安心材料になる」を「成功する」に変えるような、根拠のない因果を足さない。',
    '   企画タイトルも、元コメントの強さを超えないでください。',
    '',
    '2. 相手の元投稿はデータに含まれていません。',
    '   何についての発言かを、推測で確定しないでください。',
    '   返信文だけでは話題が分からない場合、「要確認・不明点」に',
    '   「何への返信か不明」と書いてください。',
    '',
    '3. 判定は厳しくつけてください。',
    '   A = 過去投稿と結論が違う。扱っていない論点',
    '   B = 扱ったテーマだが、場面と問いが新しい',
    '   C = 過去投稿と結論まで同じ',
    '   テーマが違っても、着地する結論が過去と同じならBかCです。',
    '   無理にAを増やさないでください。Aが0件でも構いません。',
    '',
    '4. 個人名・取引先・相手の社内事情が含まれるものは、',
    '   「公開前の確認」に「要確認」と書いてください。',
    '',
    '5. 相づち・挨拶・称賛だけの返信は、企画にしないでください。',
    '   件数を増やすより、新しい視点があるものだけを出してください。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    past ? ('# すでに扱った内容（これと結論が同じならA判定にしない）\n' + past + '\n') : '',
    '# 分析対象の返信',
    items,
    '',
    '--- 出力形式 ---',
    '{"ideas":[{',
    '  "判定": "A / B / C のどれか",',
    '  "企画タイトル": "25字以内。元コメントより強く言い切らない",',
    '  "元の返信": "もとになった返信の原文をそのまま（省略可、120字まで）",',
    '  "日付": "返信の日付",',
    '  "何が新しいか": "過去と何が違うか。40字以内",',
    '  "経営者との接点": "店舗・サービス業の社長のどの場面に当たるか。40字以内",',
    '  "要確認": "追加で必要な実例。文脈が不明ならその旨。40字以内",',
    '  "公開前の確認": "個人・取引先の情報を含むなら「要確認」。無ければ空"',
    '}]}',
    '※ C判定のものは出力に含めないでください。',
    '※ 新しい視点が無ければ、ideas を空配列にして構いません。'
  ].filter(String).join('\n');

  var json = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 12000, effort: 'high'
  }));
  return (json.ideas || []).filter(function (x) {
    return String(x['判定']).trim().toUpperCase() !== 'C';
  });
}

/** 見た目を整える */
function xFormatIdeaSheet_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return;
  sh.setColumnWidth(1, 50);
  sh.setColumnWidth(2, 240);
  sh.setColumnWidth(3, 360);
  sh.setColumnWidth(5, 220);
  sh.setColumnWidth(6, 220);
  sh.setColumnWidth(7, 200);
  sh.getRange(2, 1, last - 1, 9).setWrap(true).setVerticalAlignment('top');

  // A判定を目立たせる
  var rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('A').setBackground('#e6f4ea')
    .setRanges([sh.getRange(2, 1, last - 1, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('要確認').setBackground('#fdeceb')
    .setRanges([sh.getRange(2, 8, last - 1, 1)]).build());
  sh.setConditionalFormatRules(rules);
}

function xCountIdeas_(sh, mark) {
  if (sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .filter(function (r) { return String(r[0]).trim().toUpperCase() === mark; }).length;
}

/**
 * 「採用」に印のある企画を読む。生成はこれを優先して使う。
 */
function xAdoptedIdeas_() {
  var sh = xBook_().getSheetByName(X_SHEETS.IDEA);
  if (!sh || sh.getLastRow() < 2) return '';

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  var out = [];
  v.forEach(function (r) {
    if (!String(r[8]).trim()) return;          // 採用印なし
    out.push([
      '【' + String(r[1]).trim() + '】（判定' + String(r[0]).trim() + '）',
      '  もとの返信: ' + String(r[2]).trim(),
      '  新しさ: ' + String(r[4]).trim(),
      '  接点: ' + String(r[5]).trim(),
      String(r[6]).trim() ? ('  要確認: ' + String(r[6]).trim()) : ''
    ].filter(String).join('\n'));
  });
  return out.join('\n\n');
}

// ===== 23_XTrend.js =====

/**
 * 23_XTrend.js
 * 閲覧が伸びやすい系統を調べる
 *
 * 過去の投稿は「中身」ではなく「数字」だけ使う。
 *   ・各投稿を、役割（週の役割配分）と分類（紫微斗数の8分類）に振り分ける
 *   ・振り分けごとに、インプレッションといいねの中央値を比べる
 *   ・結果は「どの系統が読まれやすいか」として投稿案に渡す（本文は渡さない）
 *
 * 平均ではなく中央値で比べるのは、互助会で伸びた回のような
 * 極端に大きい数本に引っぱられないため。
 *
 * インプレッションだけでは「その先につながったか」が分からない。
 * 互助で表示が伸びても、自分から関わりにいかなければフォローや会話には続かない。
 * なので返信・新しいフォロー・プロフィールへのアクセスも並べて見る。
 * この3つは0の投稿が多く中央値が0になるため、1本あたりの平均で出す。
 *
 * 振り分けは X_系統分析 にポストIDごとに残すので、2回目以降は新しい投稿だけを振り分ける。
 */

/** この件数に満たない系統は「参考」扱いにする */
var X_TREND_MIN_N = 5;

/** 1回のAPI呼び出しで振り分ける件数 */
var X_TREND_BATCH = 40;

/** 投稿してからこの日数に満たないものは、数字が育っていないので外す */
var X_TREND_MATURE_DAYS = 3;

/** X_系統分析 の列 */
var X_TREND_HEADERS = ['ポストID', '日付', '冒頭', 'インプレッション', 'いいね', '返信',
  '新しいフォロー', 'プロフィールへのアクセス', '役割', '分類', '話題', '除外'];

/**
 * メニューから呼ぶ。X_反応データ の自分の投稿を振り分けて集計する。
 */
function xAnalyzeTrends() {
  var started = Date.now();
  var posts = xTrendPosts_();
  if (!posts.length) {
    xToast_('X_反応データ に自分の投稿がありません。先にCSVを貼ってください。');
    return;
  }

  var sh = xSheet_('X_系統分析', X_TREND_HEADERS);
  var done = xTrendDone_(sh);
  var todo = posts.filter(function (p) { return !done[p.id]; });

  var roles = xSettingLines_(xReadSetting_(), '週の役割配分', X_DEFAULT_ROLES)
    .map(function (l) { return l.replace(/\s*[:：]\s*[0-9０-９]+\s*本?$/, '').trim(); });
  var cats = X_CATEGORIES.map(function (c) { return c.name; });

  // 新しい投稿だけを、まとめて並列で振り分ける
  var batches = [];
  for (var i = 0; i < todo.length; i += X_TREND_BATCH) batches.push(todo.slice(i, i + X_TREND_BATCH));

  var results = xClaudeBatch_(batches.map(function (b) {
    return {
      system: xTrendSystem_(roles, cats),
      userText: b.map(function (p, k) {
        return '[' + k + '] ' + p.body.replace(/\s+/g, ' ').slice(0, 160);
      }).join('\n'),
      maxTokens: 12000,
      effort: 'low'
    };
  }));

  var added = [];
  var skipped = 0;
  for (var bi = 0; bi < batches.length; bi++) {
    var r = results[bi];
    var list = [];
    if (r && r.ok) {
      try { list = (xParseJson_(r.text).items || []); } catch (e) { list = []; }
    }
    var byIdx = {};
    list.forEach(function (x) { byIdx[Number(x.i)] = x; });

    batches[bi].forEach(function (p, k) {
      var x = byIdx[k];
      if (!x) { skipped++; return; }
      added.push([p.id, p.date, p.body.replace(/\s+/g, ' ').slice(0, 60), p.imp, p.like, p.reply,
        p.follow, p.profile,
        String(x['役割'] || ''), String(x['分類'] || ''), String(x['話題'] || ''), p.excluded ? '除外' : '']);
    });
  }

  if (added.length) {
    var width = Math.max(sh.getLastColumn(), X_TREND_HEADERS.length);
    var rows = added.map(function (row) { while (row.length < width) row.push(''); return row; });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  }

  // 数字は最新のCSVで上書きする（伸びたあとの数字を使うため）
  xTrendRefreshNumbers_(sh, posts);

  var summary = xTrendSummary_(sh);
  xWriteTrendSummary_(summary);

  var msg = posts.length + '件のうち' + added.length + '件を新しく振り分けました' +
    (skipped ? '（' + skipped + '件は振り分けできず。もう一度押すと続きをやります）' : '') +
    '。結果は X_系統の傾向 にあります（' + Math.round((Date.now() - started) / 1000) + '秒）。';
  Logger.log(msg);
  xToast_(msg);
}

/** 振り分けの指示 */
function xTrendSystem_(roles, cats) {
  return [
    'X の投稿を、決められた区分に振り分けてください。',
    '各行は [番号] 投稿の冒頭（約150字で切れています） です。',
    '',
    '■ 役割（1つ選ぶ）',
    roles.map(function (r) { return '・' + r; }).join('\n'),
    '',
    '■ 分類（1つ選ぶ）',
    X_CATEGORIES.map(function (c) { return '・' + c.name + '（' + c.desc + '）'; }).join('\n'),
    '',
    '■ 話題',
    '何についての投稿かを15字以内で。',
    '',
    '冒頭しか無いので、迷ったら書き出しから読み取れる範囲で一番近いものを選んでください。',
    '出力はJSONのみ。説明やコードフェンスは付けないでください。',
    '{"items":[{"i":0,"役割":"…","分類":"…","話題":"…"}]}'
  ].join('\n');
}

/** X_反応データ から自分の投稿を読む（返信は除く） */
function xTrendPosts_() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });
  var exCol = head.indexOf('除外');
  if (ci.body < 0) return [];

  var num = function (row, idx) {
    if (idx < 0) return 0;
    var x = parseInt(String(row[idx] || '0').replace(/,/g, ''), 10);
    return isNaN(x) ? 0 : x;
  };

  var dates = [];
  var out = [];
  var seen = {};
  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body || body.charAt(0) === '@') continue;

    var id = ci.id >= 0 ? String(values[r][ci.id] || '').trim() : '';
    if (!id) id = 'row' + r + ':' + body.slice(0, 20);
    if (seen[id]) continue;          // 期間が重なるCSVを続けて貼っても二重に数えない
    seen[id] = true;

    var d = ci.date >= 0 ? xParseDate_(values[r][ci.date]) : null;
    if (d) dates.push(d);
    out.push({
      id: id, d: d,
      date: d ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') : '',
      body: body,
      imp: num(values[r], ci.imp), like: num(values[r], ci.like), reply: num(values[r], ci.reply),
      follow: num(values[r], ci.follow), profile: num(values[r], ci.profile),
      excluded: exCol >= 0 && String(values[r][exCol] || '').trim() !== ''
    });
  }

  // 投稿したばかりのものは外す（データの最新日から数える）
  if (dates.length) {
    var latest = new Date(Math.max.apply(null, dates));
    var limit = new Date(latest.getTime() - (X_TREND_MATURE_DAYS - 1) * 24 * 3600 * 1000);
    limit.setHours(0, 0, 0, 0);
    out = out.filter(function (p) { return !p.d || p.d < limit; });
  }
  return out;
}

/** すでに振り分けたポストID */
function xTrendDone_(sh) {
  var done = {};
  if (sh.getLastRow() < 2) return done;
  var c = X_TREND_HEADERS.indexOf('役割');
  sh.getRange(2, 1, sh.getLastRow() - 1, X_TREND_HEADERS.length).getValues().forEach(function (r) {
    if (String(r[0]).trim() && String(r[c]).trim()) done[String(r[0]).trim()] = true;
  });
  return done;
}

/** 最新のCSVの数字で、インプレッション・いいね・返信・除外を書き直す */
function xTrendRefreshNumbers_(sh, posts) {
  if (sh.getLastRow() < 2) return;
  var byId = {};
  posts.forEach(function (p) { byId[p.id] = p; });

  var n = sh.getLastRow() - 1;
  var values = sh.getRange(2, 1, n, X_TREND_HEADERS.length).getValues();
  var H = function (name) { return X_TREND_HEADERS.indexOf(name); };
  values.forEach(function (r) {
    var p = byId[String(r[0]).trim()];
    if (!p) return;
    r[H('インプレッション')] = p.imp;
    r[H('いいね')] = p.like;
    r[H('返信')] = p.reply;
    r[H('新しいフォロー')] = p.follow;
    r[H('プロフィールへのアクセス')] = p.profile;
    // 除外は、反応データ側か、このシートで手で付けた印のどちらかがあれば除外
    if (p.excluded) r[H('除外')] = '除外';
  });
  sh.getRange(2, 1, n, X_TREND_HEADERS.length).setValues(values);
}

/**
 * 系統ごとの中央値を出す。
 * @return {Object} { total, overall, byRole:[...], byCat:[...] }
 */
function xTrendSummary_(sh) {
  var H = function (name) { return X_TREND_HEADERS.indexOf(name); };
  var rows = sh.getLastRow() < 2 ? [] :
    sh.getRange(2, 1, sh.getLastRow() - 1, X_TREND_HEADERS.length).getValues()
      .filter(function (r) { return String(r[0]).trim() && !String(r[H('除外')]).trim(); });

  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function avg(a) {
    if (!a.length) return 0;
    return Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10;
  }
  var col = function (list, name) { return list.map(function (r) { return Number(r[H(name)]) || 0; }); };

  function group(colName) {
    var g = {};
    rows.forEach(function (r) {
      var k = String(r[H(colName)]).trim() || '（不明）';
      (g[k] = g[k] || []).push(r);
    });
    return Object.keys(g).map(function (k) {
      var list = g[k];
      return {
        name: k, n: list.length,
        imp: median(list.map(function (r) { return Number(r[H('インプレッション')]) || 0; })),
        like: median(col(list, 'いいね')),
        reply: avg(col(list, '返信')),
        follow: avg(col(list, '新しいフォロー')),
        profile: avg(col(list, 'プロフィールへのアクセス')),
        topics: list.slice().sort(function (a, b) {
          return (Number(b[H('インプレッション')]) || 0) - (Number(a[H('インプレッション')]) || 0);
        }).slice(0, 3).map(function (r) { return String(r[H('話題')]); })
      };
    }).sort(function (a, b) { return b.imp - a.imp; });
  }

  return {
    total: rows.length,
    overall: median(col(rows, 'インプレッション')),
    overallReply: avg(col(rows, '返信')),
    overallFollow: avg(col(rows, '新しいフォロー')),
    overallProfile: avg(col(rows, 'プロフィールへのアクセス')),
    byRole: group('役割'),
    byCat: group('分類')
  };
}

/** 集計結果をシートに書く（人が見る用） */
function xWriteTrendSummary_(sum) {
  var sh = xSheet_('X_系統の傾向', []);
  sh.clearContents();

  var W = 8;
  var pad = function (row) { while (row.length < W) row.push(''); return row; };
  var out = [];
  out.push(pad(['閲覧が伸びやすい系統 / つながりやすい系統']));
  out.push(pad(['対象: ' + sum.total + '件（除外・投稿' + X_TREND_MATURE_DAYS + '日未満を除く）　' +
    '全体: インプ中央値 ' + sum.overall + ' / 1本あたり 返信 ' + sum.overallReply +
    '・フォロー ' + sum.overallFollow + '・プロフィール ' + sum.overallProfile]));
  out.push(pad(['※ インプ・いいねは中央値（互助会などで極端に伸びた数本に引っぱられないため）。' +
    '返信・フォロー・プロフィールは0が多いので1本あたりの平均。' + X_TREND_MIN_N + '件未満は参考値。']));
  out.push(pad(['']));

  function block(title, list) {
    out.push([title, '件数', 'インプ中央値', 'いいね中央値', '返信/本', 'フォロー/本', 'プロフィール/本', '伸びた話題（上位3つ）']);
    list.forEach(function (g) {
      out.push([g.name + (g.n < X_TREND_MIN_N ? '（参考）' : ''), g.n, g.imp, g.like,
        g.reply, g.follow, g.profile, g.topics.join(' / ')]);
    });
    out.push(pad(['']));
  }
  block('■ 役割別', sum.byRole);
  block('■ 分類別', sum.byCat);

  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(W, 420);
}

/**
 * 投稿案の生成に渡す文。系統の傾向だけで、過去の本文は含めない。
 * 集計がまだ無ければ空文字。
 */
function xTrendText_() {
  var sh = xBook_().getSheetByName('X_系統分析');
  if (!sh || sh.getLastRow() < 2) return '';

  var sum = xTrendSummary_(sh);
  var line = function (g) { return g.name + '（中央値' + g.imp + '・' + g.n + '件）'; };
  var connect = function (g) {
    return g.name + '（返信' + g.reply + '・フォロー' + g.follow + '・プロフィール' + g.profile + '/本）';
  };
  var reliable = function (list) { return list.filter(function (g) { return g.n >= X_TREND_MIN_N && g.name !== '（不明）'; }); };

  var roles = reliable(sum.byRole);
  var cats = reliable(sum.byCat);
  if (!roles.length && !cats.length) return '';

  var parts = [];
  parts.push('全体の中央値: ' + sum.overall + '（' + sum.total + '件）');
  if (roles.length) {
    parts.push('役割別・伸びやすい順: ' + roles.map(line).join(' / '));
  }
  if (cats.length) {
    parts.push('分類別・伸びやすい順: ' + cats.map(line).join(' / '));
  }
  if (roles.length) {
    var byConnect = roles.slice().sort(function (a, b) {
      return (b.follow + b.profile / 10 + b.reply / 10) - (a.follow + a.profile / 10 + a.reply / 10);
    });
    parts.push('役割別・つながりやすい順: ' + byConnect.map(connect).join(' / '));
  }
  return parts.join('\n');
}

// ===== 24_XEdit.js =====

/**
 * 24_XEdit.js
 * 1週間全体の編集
 *
 * 1本ずつは良くても、7本を並べるとテーマやエピソードが重なることがある。
 * （例：3本が「判断基準と任せる範囲」、3本が「言葉を飲み込む・叔母の話」）
 *
 * 本人のルール
 *   1. 7本を書き終えたら、テーマ・主張・エピソード・読後感の重なりを確認する
 *   2. 重なったものは、最も良い1本だけを残す
 *   3. 外した枠は、今週の別の返信・引用から企画を選び直す
 *   4. 新しい材料がなければ不足を報告する。
 *      空けたままだと週の予約ができないので、既定では事業の方向性と系統の傾向から
 *      「考え・問い」の叩き台を作って埋める（実体験・セリフ・数字は作らない）。
 *      X_設定「材料が無い枠」を「空ける」にすると、従来どおり空ける。
 *   6. 本文に【要確認】を残さない。確かめたいことは本文とは別に質問する
 *      （残ってしまった原稿は完成稿として扱わない）
 *
 * 流れ
 *   編集（重なりを見つけ、外す枠と、その枠に使う返信を決める）
 *   → 外した枠を、その返信から作り直す（並列）
 *   → 作り直した分がまだ重なっていないかを確認し、重なれば空ける
 */

/** 編集を始めてよい経過時間（これを過ぎていたら編集を省く）。GASの6分制限のため。 */
var X_EDIT_START_LIMIT_MS = 2.8 * 60 * 1000;

/** 作り直しを始めてよい経過時間（作り直しは並列で1〜1.5分かかる） */
var X_EDIT_REFILL_LIMIT_MS = 3.6 * 60 * 1000;

/** 作り直したあとの確認を始めてよい経過時間 */
var X_EDIT_CHECK_LIMIT_MS = 4.2 * 60 * 1000;

/**
 * 週全体を編集する。
 *
 * @param {Object} ctx xGenCtx_ の戻り値
 * @param {Array<Object>} posts _idx つきの投稿
 * @param {Array<number>|null} keepIdx 本人が残すと決めた枠（0始まり）。null なら編集者が決める
 * @return {Object} { posts, replaced, shortage:[idx], skipped }
 */
function xEditWeek_(ctx, posts, keepIdx) {
  var result = { posts: posts.slice(), replaced: 0, shortage: [], noMaterial: [], skipped: '' };
  var elapsed = function () { return Date.now() - ctx.started; };

  if (!keepIdx && elapsed() > X_EDIT_START_LIMIT_MS) {
    result.skipped = '時間の都合で週の編集を省きました。「④ 選んだ本を残して、残りを作り直す」で続けられます';
    return result;
  }

  // 1) 編集：重なりを見て、作り直す枠と材料を決める
  var plan = xEditPlan_(ctx, posts, keepIdx);
  if (!plan) {
    result.skipped = '週の編集に失敗しました。「④ 選んだ本を残して、残りを作り直す」でやり直せます';
    return result;
  }

  var byIdx = {};
  posts.forEach(function (p) { byIdx[p._idx] = p; });

  // 残す本・外す本に編集メモを付ける
  plan.groups.forEach(function (g) {
    g.members.forEach(function (i) {
      if (!byIdx[i]) return;
      if (i === g.keep) {
        byIdx[i]._note = '重なり（' + g.members.map(function (m) { return m + 1; }).join('・') +
          '本目／' + g.kind + '）の中から残した1本';
      }
    });
  });
  if (keepIdx) keepIdx.forEach(function (i) {
    if (byIdx[i]) { byIdx[i]._note = '本人が残すと決めた本'; byIdx[i]._state = '残す'; }
  });
  xApplyOverclaims_(byIdx, plan.overclaims);

  if (!plan.replace.length) return result;

  // 時間が足りなければ作り直さない。外すはずだった本は消さずに残し、印だけ付ける。
  if (elapsed() > X_EDIT_REFILL_LIMIT_MS) {
    plan.replace.forEach(function (r) {
      if (byIdx[r.idx]) byIdx[r.idx]._note = '他の本と重なり（時間の都合で作り直し未実施）';
    });
    result.skipped = '重なりは見つけましたが、時間の都合で作り直していません。' +
      '「編集メモ」を見て「④ 選んだ本を残して、残りを作り直す」を押してください';
    return result;
  }

  var rejected = plan.replace.map(function (r) { return byIdx[r.idx]; }).filter(Boolean);
  var fillByDirection = String((ctx.setting || {})['材料が無い枠'] || '方向性から作る').trim() !== '空ける';

  // 材料が無い枠：既定では方向性から作る。「空ける」設定なら空ける。
  plan.replace.filter(function (r) { return !r.material; }).forEach(function (r) {
    result.noMaterial.push(r.idx);
    if (fillByDirection) r.material = X_DIRECTION_MATERIAL;
    else result.shortage.push(r.idx);
  });
  var withMaterial = plan.replace.filter(function (r) { return r.material; });

  // 2) 外した枠を作り直す（材料がある枠だけ）
  var keepPosts = posts.filter(function (p) {
    return !plan.replace.some(function (r) { return r.idx === p._idx; });
  });
  var fresh = withMaterial.length ? xRefill_(ctx, withMaterial, keepPosts, rejected) : [];

  // 作り直せなかった枠は空ける
  withMaterial.forEach(function (r) {
    if (!fresh.some(function (p) { return p._idx === r.idx; })) result.shortage.push(r.idx);
  });

  // 3) 作り直した分が、まだ重なっていないかを確認する
  if (fresh.length && elapsed() < X_EDIT_CHECK_LIMIT_MS) {
    var rc = xEditRecheck_(ctx, keepPosts.concat(fresh), fresh.map(function (p) { return p._idx; }));
    var dup = rc.drop;
    var freshByIdx = {};
    fresh.forEach(function (p) { freshByIdx[p._idx] = p; });
    xApplyOverclaims_(freshByIdx, rc.overclaims);
    var dropped = fresh.filter(function (p) { return dup.indexOf(p._idx) >= 0; });
    fresh = fresh.filter(function (p) { return dup.indexOf(p._idx) < 0; });

    // まだ重なっていた枠は、方向性からもう一度だけ作る（重なった案も「外した案」に足す）
    if (dropped.length && fillByDirection && elapsed() < X_EDIT_REFILL_LIMIT_MS) {
      var usedSubj = fresh.map(function (p) { return p['題材']; }).filter(Boolean);
      var again = dropped.map(function (p) {
        var subj = X_SUBJECTS.filter(function (x) { return usedSubj.indexOf(x) < 0; })[0] || '仕事の考え方';
        usedSubj.push(subj);
        return { idx: p._idx, material: X_DIRECTION_MATERIAL, subject: subj, plan: '', claim: '', reason: '' };
      });
      var second = xRefill_(ctx, again, keepPosts.concat(fresh), rejected.concat(dropped));
      second.forEach(function (p) {
        p._note += '（2回目。重なりの最終確認はしていません）';
        if (result.noMaterial.indexOf(p._idx) < 0) result.noMaterial.push(p._idx);
      });
      fresh = fresh.concat(second);
      dropped.forEach(function (p) {
        if (!second.some(function (q) { return q._idx === p._idx; })) result.shortage.push(p._idx);
      });
    } else {
      dropped.forEach(function (p) { result.shortage.push(p._idx); });
    }
  } else if (fresh.length) {
    result.skipped = '時間の都合で、作り直した分の重なり確認は省きました';
  }

  result.posts = keepPosts.concat(fresh).sort(function (a, b) { return a._idx - b._idx; });
  result.replaced = fresh.length;
  result.shortage.sort(function (a, b) { return a - b; });
  // 報告には「最終的に方向性から作った枠」だけを出す
  result.noMaterial = result.noMaterial.filter(function (i) {
    return fresh.some(function (p) { return p._idx === i && p._fromDirection; });
  }).sort(function (a, b) { return a - b; });
  return result;
}

/** 材料が無い枠に使う、目印の材料 */
var X_DIRECTION_MATERIAL = { no: '方向性', text: '', direction: true };

/**
 * 編集者に、重なりと作り直す枠を決めてもらう。
 * @return {Object|null} { groups:[{members, keep, kind}], replace:[{idx, material, plan, claim, reason}] }
 */
function xEditPlan_(ctx, posts, keepIdx) {
  var replies = ctx.replyList || [];
  var lines = [];

  lines.push('# 今週の7本');
  posts.forEach(function (p) { lines.push(xEditPostText_(p)); });
  lines.push('');
  lines.push('# 今週の返信・引用（材料の候補）');
  lines.push(replies.length ? xFormatReplies_(replies) : '（なし）');
  if (ctx.notes) {
    lines.push('');
    lines.push('# 今週あったこと（本人のメモ。材料の候補）');
    lines.push(ctx.notes);
  }
  lines.push('');

  if (keepIdx) {
    var replaceIdx = posts.map(function (p) { return p._idx; })
      .filter(function (i) { return keepIdx.indexOf(i) < 0; });
    lines.push('# 依頼');
    lines.push('本人が残すと決めた本: ' + keepIdx.map(function (i) { return i + 1; }).join('・') + '本目');
    lines.push('作り直す枠: ' + replaceIdx.map(function (i) { return i + 1; }).join('・') + '本目');
    lines.push('重なりの判定はしなくて構いません。作り直す枠ごとに、使う材料と企画を決めてください。');
    lines.push('残す本とも、作り直す枠同士とも、テーマ・主張・エピソード・読後感を重ねないでください。');
    lines.push('作り直す枠の今の案と同じ方向（同じテーマ・同じ人物・同じ結論）にも戻らないでください。');
    lines.push('"重複" は空の配列で構いません。"作り直す" には上の作り直す枠をすべて入れてください。');
  } else {
    lines.push('# 依頼');
    lines.push('7本を1週間として並べたときの重なりを確認し、作り直す枠と材料を決めてください。');
  }

  var res = xClaudeBatch_([{
    system: xEditSystem_(),
    userText: lines.join('\n'),
    maxTokens: 16000,
    effort: 'medium'
  }])[0];

  if (!res || !res.ok) {
    Logger.log('週の編集に失敗: ' + ((res && res.error) || '不明'));
    return null;
  }

  var json;
  try { json = xParseJson_(res.text); } catch (e) {
    Logger.log('週の編集の返答を読めませんでした: ' + e.message);
    return null;
  }

  var valid = {};
  posts.forEach(function (p) { valid[p._idx] = true; });
  var toIdx = function (n) { var i = parseInt(n, 10) - 1; return valid[i] ? i : -1; };
  var findReply = function (key) {
    var k = String(key || '').trim();
    if (!k || k === 'null' || k === 'なし') return null;
    var mm = k.match(/M\s*(\d+)/i);
    if (mm) return (ctx.noteList || []).filter(function (n) { return n.no === 'M' + mm[1]; })[0] || null;
    // 番号なしで「メモ」とだけ返ってきた場合は、1件目を使う
    if (/^メモ|今週あったこと/.test(k)) return (ctx.noteList || [])[0] || null;
    var m = k.match(/R\s*(\d+)/i);
    if (!m) return null;
    return replies.filter(function (r) { return r.no === 'R' + m[1]; })[0] || null;
  };

  // 重なりのグループ（自動の編集のときだけ使う）
  var groups = [];
  (json['重複'] || []).forEach(function (g) {
    var members = (g['本'] || []).map(toIdx).filter(function (i) { return i >= 0; });
    var keep = toIdx(g['残す']);
    if (members.length < 2) return;
    if (members.indexOf(keep) < 0) keep = members[0];
    groups.push({ members: members, keep: keep, kind: String(g['重なり'] || '') });
  });

  // 作り直す枠
  var protectedIdx = {};
  if (keepIdx) keepIdx.forEach(function (i) { protectedIdx[i] = true; });
  else groups.forEach(function (g) { protectedIdx[g.keep] = true; });

  var seen = {};
  var replace = [];
  (json['作り直す'] || []).forEach(function (r) {
    var idx = toIdx(r['本']);
    if (idx < 0 || seen[idx] || protectedIdx[idx]) return;
    seen[idx] = true;
    replace.push({
      idx: idx,
      material: findReply(r['材料']),
      subject: xNormSubject_(r['題材']),
      plan: String(r['企画'] || ''),
      claim: String(r['主張'] || ''),
      reason: String(r['理由'] || '')
    });
  });

  // 自動の編集で、重なりの「外す側」なのに作り直しに入っていない枠は足す（材料なし＝不足扱い）
  if (!keepIdx) {
    groups.forEach(function (g) {
      g.members.forEach(function (i) {
        if (i !== g.keep && !seen[i] && !protectedIdx[i]) {
          seen[i] = true;
          replace.push({ idx: i, material: null, plan: '', claim: '', reason: '重なりのため' });
        }
      });
    });
  } else {
    // 本人指定のときは、残す本以外をすべて作り直す
    posts.forEach(function (p) {
      if (!protectedIdx[p._idx] && !seen[p._idx]) {
        seen[p._idx] = true;
        replace.push({ idx: p._idx, material: null, plan: '', claim: '', reason: '材料の指定なし' });
      }
    });
  }

  // 作り直す枠には、残す本と重ならない題材を割り振る（編集者が決めていなければ）
  xAssignSubjects_(replace, posts);

  var overclaims = xReadOverclaims_(json, toIdx);

  if (json['不足']) Logger.log('編集者のメモ（不足）: ' + json['不足']);
  Logger.log('週の編集: 重なり' + groups.length + '組 / 作り直す枠 ' +
    replace.map(function (r) { return (r.idx + 1) + '本目(' + (r.material ? r.material.no : '材料なし') + ')'; }).join('、'));

  return { groups: groups, replace: replace, overclaims: overclaims };
}

/** 「言い過ぎ」を {idx: ['…', …]} にする */
function xReadOverclaims_(json, toIdx) {
  var out = {};
  (json['言い過ぎ'] || []).forEach(function (o) {
    var i = toIdx(o['本']);
    if (i < 0) return;
    var line = '言い過ぎの可能性:「' + String(o['箇所'] || '').slice(0, 60) + '」→ ' + String(o['直し方'] || '');
    (out[i] = out[i] || []).push(line);
  });
  return out;
}

/** 題材の表記ゆれを X_SUBJECTS に寄せる。当てはまらなければ空 */
function xNormSubject_(v) {
  var t = String(v || '').trim();
  if (!t) return '';
  for (var i = 0; i < X_SUBJECTS.length; i++) {
    if (t === X_SUBJECTS[i] || t.indexOf(X_SUBJECTS[i]) >= 0 || X_SUBJECTS[i].indexOf(t) >= 0) return X_SUBJECTS[i];
  }
  if (/これから|やりたい|将来/.test(t)) return 'これからやりたい仕事';
  if (/日常|暮らし/.test(t)) return '日常の気づき';
  return '';
}

/**
 * 作り直す枠に題材を割り振る。
 * 編集者が決めた題材は尊重し、決まっていない枠にだけ、まだ使っていない題材を順に入れる。
 * 「これからやりたい仕事」は週1本まで。
 */
function xAssignSubjects_(replace, posts) {
  var used = {};
  replace.forEach(function (r) { if (r.subject) used[r.subject] = (used[r.subject] || 0) + 1; });
  posts.forEach(function (p) {
    if (replace.some(function (r) { return r.idx === p._idx; })) return;
    var s = xNormSubject_(p['題材']) || xNormSubject_(p['役割']);
    if (s) used[s] = (used[s] || 0) + 1;
  });

  var future = 0;
  replace.forEach(function (r) {
    if (r.subject === 'これからやりたい仕事' && ++future > 1) { r.subject = ''; used['これからやりたい仕事']--; }
  });

  replace.forEach(function (r) {
    // 材料がある枠は、題材を材料に任せる（無理に別の題材をかぶせると材料がゆがむ）
    if (r.subject || r.material) return;
    var pick = '';
    for (var i = 0; i < X_SUBJECTS.length && !pick; i++) {
      var s = X_SUBJECTS[i];
      if (!(used[s] > 0)) pick = s;
    }
    if (!pick) {
      pick = X_SUBJECTS.filter(function (s) { return s !== 'これからやりたい仕事'; })
        .sort(function (a, b) { return (used[a] || 0) - (used[b] || 0); })[0];
    }
    r.subject = pick;
    used[pick] = (used[pick] || 0) + 1;
  });
}

/** 「言い過ぎ」を、事実確認が必要な箇所と編集メモに足す */
function xApplyOverclaims_(byIdx, overclaims) {
  Object.keys(overclaims || {}).forEach(function (k) {
    var p = byIdx[k];
    if (!p) return;
    var lines = overclaims[k];
    var cur = String(p['事実確認が必要な箇所'] || '').trim();
    p['事実確認が必要な箇所'] = (cur && cur !== 'なし' ? cur + '\n' : '') + lines.join('\n');
    p._note = (p._note ? p._note + ' / ' : '') + '実績の書き方を確認（' + lines.length + '箇所）';
    p._overclaim = true;
  });
}

/** 編集者の指示 */
function xEditSystem_() {
  return [
    'あなたは、ある書き手のXアカウントの編集者です。',
    '1本ずつの完成度ではなく、1週間を通して読んだときの重なりを見ます。文章は直しません。',
    '',
    '■ 重なりの確認',
    '次の4つで、7本を比べてください。',
    '・テーマ（何について書いているか）',
    '・主張（何を言っているか・どこに着地しているか）',
    '・エピソード（どの出来事・どの人物の話か。同じ人物の話は重なりです）',
    '・読後感（読み終えたときに残る気持ち）',
    'どれか1つでもはっきり重なっていれば、重なりとして扱ってください。',
    '1週間に同じ主張は原則1本です。長文と短文で同じ主張を言い直しているものも、重なりです。',
    '',
    '■ 題材の偏り',
    '・業務改善・仕組み化の話は、週に' + X_SYSTEM_TOPIC_MAX + '本までです。',
    '  それより多ければ「題材の偏り」として重なりと同じに扱い、良い' + X_SYSTEM_TOPIC_MAX + '本だけ残してください。',
    '・外した枠には、' + X_SUBJECTS.join('・') + ' のうち、',
    '  残す本に無い題材を "題材" として割り当ててください。「これからやりたい仕事」は週1本までです。',
    '',
    '■ 言い過ぎの確認（文章は直さず、箇所だけ挙げる）',
    '・まだ実績が確認できないこと（これからの事業・サービス・取り組み）を、',
    '  すでにやっている・成果が出ているように書いている箇所',
    '・材料に無い経験や、材料に無い相談者・お客様の発言を書いている箇所',
    '見つけたら "言い過ぎ" に入れ、直し方（過去形にする／「こうしたい」にする／削る など）を添えてください。',
    '',
    '■ 残す1本の選び方',
    '・重なったグループからは、最も良い1本だけを残します。',
    '・同じくらいなら、【要確認】が残っていないほう、材料（返信）に忠実なほうを残してください。',
    '',
    '■ 外した枠の作り直し',
    '・今週の返信・引用の中から、まだどの本にも使われていない材料を選んでください。',
    '  「元になった返信・切り口」に書かれている材料は、使用済みです。',
    '  使用済みの材料と同じ論点の返信も、選ばないでください。',
    '・1つの材料は1つの枠にだけ使ってください。今週あったこと（M番号）も1件ずつ別の材料です。',
    '・新しい材料が無い枠は、"材料": null にしてください。無理に埋めないでください。',
    '・企画は30字以内。主張は1文で、元の返信より強く言い切らないでください。',
    '・割り当てられた役割に合う材料があればそれを選び、無ければ役割は変わって構いません。',
    '・作り直す枠ごとに "題材" を1つ決めてください。残す本・他の作り直す枠と題材を散らしてください。',
    '・毎回サービス紹介や固定ポストへの誘導に着地する企画にしないでください。',
    '',
    '■ 出力（JSONのみ。説明やコードフェンスは付けない）',
    '{',
    '  "重複": [{"本": [1, 6, 7], "重なり": "テーマ・主張", "残す": 1, "理由": "…"}],',
    '  "作り直す": [{"本": 6, "材料": "R12", "題材": "人柄", "企画": "…", "主張": "…", "理由": "…"}],',
    '  "言い過ぎ": [{"本": 3, "箇所": "本文の該当部分", "直し方": "「こうしたい」にする"}],',
    '  "不足": "材料が足りない場合の説明（無ければ空文字）"',
    '}',
    '本の番号は 1 から数えます。材料は返信の番号（R1 など）か、今週あったことの番号（M1 など）、無ければ null。'
  ].join('\n');
}

/** 編集者に見せる1本ぶんの要約 */
function xEditPostText_(p) {
  var body = String(p['本文'] || '').trim();
  return [
    '## ' + (p._idx + 1) + '本目' + (p['役割'] ? '（役割: ' + p['役割'] + '）' : ''),
    'テーマ: ' + (p['テーマ'] || ''),
    '狙い: ' + (p['投稿の狙い'] || p['狙い'] || ''),
    '元になった返信・切り口: ' + (p['元になった返信・切り口'] || ''),
    '本文:',
    body || '（空き）'
  ].join('\n');
}

/**
 * 外した枠を、決めた材料から作り直す（並列）。
 * @return {Array<Object>} _idx つきの投稿
 */
function xRefill_(ctx, slots, keepPosts, rejected) {
  var keepText = keepPosts.map(function (p) {
    var head = String(p['本文'] || '').trim().split('\n')[0];
    return '  ・' + (p._idx + 1) + '本目: ' + (p['テーマ'] || '') + ' ／ ' + head;
  }).join('\n');
  var rejectedText = rejected.filter(function (p) { return String(p['本文'] || '').trim(); }).map(function (p) {
    return '  × ' + (p['テーマ'] || '') + ' ／ ' + String(p['本文'] || '').trim().split('\n')[0];
  }).join('\n');

  var reqs = slots.map(function (s) {
    if (s.material && s.material.direction) {
      return {
        system: ctx.system,
        userText: ctx.context + '\n' +
          xGenRequest_(s.idx, 1, ctx.count, ctx.themes, ctx.plan, ctx.spec, ctx.pastThemes) + '\n' +
          xDirectionRequest_(s.subject, keepText, rejectedText),
        maxTokens: X_GEN_MAX_TOKENS,
        effort: 'high'
      };
    }
    var extra = [
      '',
      '## この枠は作り直しです',
      '週全体を編集した結果、前の案が他の本と重なっていたので、別の材料から作り直します。',
      '',
      '### この枠で使う材料',
      '[' + s.material.no + '] ' + s.material.text,
      '',
      '### この枠の企画',
      s.subject ? '題材: ' + s.subject : '',
      '企画: ' + (s.plan || '（材料から考えてください）'),
      s.claim ? '主張: ' + s.claim : '',
      '上の材料1つだけで書いてください。他の返信や過去のエピソードを足さないでください。',
      '材料が短くて長文にならない場合は、短く仕上げてください。',
      '',
      '### 次の本とテーマ・主張・エピソード・読後感を重ねない（同じ週に出す本）',
      keepText || '  （なし）',
      '',
      '### 重なりとして外した案（この方向に戻らない）',
      rejectedText || '  （なし）'
    ].filter(function (x) { return x !== ''; }).join('\n');

    return {
      system: ctx.system,
      userText: ctx.context + '\n' +
        xGenRequest_(s.idx, 1, ctx.count, ctx.themes, ctx.plan, ctx.spec, ctx.pastThemes) + '\n' + extra,
      maxTokens: X_GEN_MAX_TOKENS,
      effort: 'high'
    };
  });

  var res = xClaudeBatch_(reqs);
  var out = [];
  for (var i = 0; i < slots.length; i++) {
    if (!res[i] || !res[i].ok) {
      Logger.log((slots[i].idx + 1) + '本目の作り直しに失敗: ' + ((res[i] && res[i].error) || '不明'));
      continue;
    }
    var one = xParsePosts_(res[i].text).slice(0, 1);
    if (!one.length) {
      Logger.log((slots[i].idx + 1) + '本目の作り直しを読めませんでした');
      continue;
    }
    one[0]._idx = slots[i].idx;
    if (slots[i].material.direction) {
      one[0]._fromDirection = true;
      one[0]._note = '今週の材料なし：題材「' + (slots[i].subject || '仕事の考え方') + '」で作った叩き台（実績・発言は入れていません）';
      one[0]['題材'] = slots[i].subject || '';
      if (!one[0]['元になった返信・切り口']) one[0]['元になった返信・切り口'] = '題材: ' + (slots[i].subject || '');
      out.push(one[0]);
      continue;
    }
    one[0]._note = '重なりのため作り直し（材料: ' + slots[i].material.no + '）' +
      (slots[i].reason ? ' ' + slots[i].reason : '');
    if (slots[i].subject) one[0]['題材'] = slots[i].subject;
    if (!one[0]['元になった返信・切り口']) {
      one[0]['元になった返信・切り口'] = '[' + slots[i].material.no + '] ' + slots[i].material.text.slice(0, 60);
    }
    out.push(one[0]);
  }
  return out;
}

/**
 * 今週の材料が無い枠の依頼文。
 *
 * 事業の方向性シートは「軸の確認」だけに使い、そこからテーマは作らない（本人の指示）。
 * 割り当てた題材で、出来事ではなく考え方・仕事の方針として書かせる。
 * 本文に【要確認】は残さず完成させ、確かめたいことは別欄の質問にする。
 */
function xDirectionRequest_(subject, keepText, rejectedText) {
  var subj = subject || '仕事の考え方';
  var how = {
    '仕事の考え方': '仕事をするときに何を大事にしているか・どう判断しているかを、自分の考えとして書く。',
    '実務の視点': '仕事の進め方で、細かいけれど見落とされやすい点を、自分の見方として書く。',
    '人柄': 'どんな人がどんな気持ちで仕事をしているかが伝わるように、好きなこと・苦手なこと・こだわりを考えとして書く。',
    '日常の気づき': '仕事の外で考えたことを、仕事の見方につなげて書く。具体的な場面は材料にあるものだけ。無ければ「最近よく思うこと」として書く。',
    'これからやりたい仕事': 'これから取り組みたいこと・大切にしたい仕事の進め方を「こうしたい」「こう考えている」で書く。まだ実績は無いので、やっている・成果が出ているようには書かない。'
  }[subj] || '';

  return [
    '',
    '## この枠は、今週の返信に使える材料が無かった枠です',
    '題材: ' + subj,
    how,
    '',
    '### 書き方',
    '・テーマは「③ 事業の方向性」から作らないでください。③は軸から外れていないかの確認だけに使います。',
    '・今週の返信・引用に、この題材で使える論点があれば優先してください（同じ週の本と重ならない範囲で）。',
    '・無ければ、この書き手が今後大切にしたい考え方・仕事の方針として書いてください。',
    '・実績、相談者・お客様・スタッフの発言は作らないでください。',
    '・本文に【要確認】や穴を残さず、完成させてください。確かめたいことは「事実確認が必要な箇所」に質問として書いてください。',
    '・業務改善・仕組み化の話にしないでください。',
    '・短文の長さで構いません。',
    '',
    '### 次の本とテーマ・主張・読後感を重ねない（同じ週に出す本）',
    keepText || '  （なし）',
    '',
    '### 重なりとして外した案（この方向に戻らない）',
    rejectedText || '  （なし）'
  ].join('\n');
}

/**
 * 作り直した分が、まだ重なっていないかを確認する。
 * @param {Array<Object>} all 週の全投稿
 * @param {Array<number>} freshIdx 作り直した枠
 * @return {Array<number>} まだ重なっている「作り直した枠」
 */
function xEditRecheck_(ctx, all, freshIdx) {
  var lines = ['# 今週の本'];
  all.slice().sort(function (a, b) { return a._idx - b._idx; })
    .forEach(function (p) { lines.push(xEditPostText_(p)); });
  lines.push('');
  lines.push('# 依頼');
  lines.push('作り直した本: ' + freshIdx.map(function (i) { return i + 1; }).join('・') + '本目');
  lines.push('作り直した本が、他の本とまだ重なっていないかだけを確認してください。');
  lines.push('重なっていれば、作り直した本のほうを "外す" に入れてください。作り直しは不要です。');
  lines.push('あわせて、作り直した本に「言い過ぎ」（実績が無いことを実績のように書いている・材料に無い発言を書いている）があれば挙げてください。');
  lines.push('{"外す": [6], "理由": "…", "言い過ぎ": [{"本": 6, "箇所": "…", "直し方": "…"}]}');
  lines.push('重なりも言い過ぎも無ければ {"外す": [], "言い過ぎ": []}');

  var res = xClaudeBatch_([{
    system: xEditSystem_().split('■ 外した枠の作り直し')[0] + '出力はJSONのみ。',
    userText: lines.join('\n'),
    maxTokens: 8000,
    effort: 'medium'
  }])[0];

  if (!res || !res.ok) return { drop: [], overclaims: {} };
  try {
    var json = xParseJson_(res.text);
    var out = (json['外す'] || []).map(function (n) { return parseInt(n, 10) - 1; })
      .filter(function (i) { return freshIdx.indexOf(i) >= 0; });
    if (out.length) Logger.log('作り直した分がまだ重なっていました: ' +
      out.map(function (i) { return (i + 1) + '本目'; }).join('・') + ' ' + (json['理由'] || ''));
    var toFresh = function (n) { var i = parseInt(n, 10) - 1; return freshIdx.indexOf(i) >= 0 ? i : -1; };
    return { drop: out, overclaims: xReadOverclaims_(json, toFresh) };
  } catch (e) {
    return { drop: [], overclaims: {} };
  }
}


/**
 * メニューから呼ぶ。直近の投稿案のうち、選んだ本を残して残りを作り直す。
 *
 * 残す本は、ダイアログで番号を入れる（例: 1,2,4）。
 * スクリプトエディタから実行した場合は、X_投稿案 の「状態」が「残す」の行を残す。
 */
function xRegenerateDrafts() {
  var t0 = Date.now();
  var batch = xLatestBatch_();
  if (!batch.length) {
    xToast_('X_投稿案 に投稿案がありません。先に「④ 今週の投稿案を作る」を実行してください。');
    return;
  }

  var keep = batch.filter(function (p) { return p._state === '残す'; }).map(function (p) { return p._idx; });

  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (ui) {
    var r = ui.prompt('残す本を選んで、残りを作り直します',
      '残す本の番号をカンマ区切りで入れてください（例: 1,2,4）。\n' +
      '直近の投稿案（' + batch.length + '本）が対象です。' +
      (keep.length ? '\n空のままOKなら、「状態」が「残す」の本（' +
        keep.map(function (i) { return i + 1; }).join(',') + '）を残します。' : ''),
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    var typed = xParseNumbers_(r.getResponseText(), batch.length);
    if (typed.length) keep = typed;

    // 材料が足りないことが多いので、ここでも今週あったことを聞く
    var r2 = ui.prompt(
      '今週あったこと（材料が足りないとき用・空でも進みます）',
      '作り直す枠の材料になります。1行に1つ、いくつでも。\n' +
      '相談で言われた言葉、詰まったこと、作ったもの、現場で見たこと。\n' +
      '空のままだと、今週の返信の中から選びます。',
      ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() === ui.Button.OK) {
      String(r2.getResponseText() || '').split(/\r?\n/)
        .map(function (x) { return x.trim(); }).filter(String)
        .forEach(function (note) { xSaveThisWeekNote_(note); });
    }
  }

  if (!keep.length) {
    xToast_('残す本が選ばれていません。番号を入れるか、「状態」を「残す」にしてください。');
    return;
  }
  if (keep.length >= batch.length) {
    xToast_('全部残す指定になっています。作り直す本がありません。');
    return;
  }

  var ctx = xGenCtx_('', batch.length);
  var edit = xEditWeek_(ctx, batch, keep);
  xFinishWeek_(ctx, edit, t0);
}

/** 「1,2,4」「1、2、4」「１ ２ ４」を枠番号（0始まり）にする */
function xParseNumbers_(text, max) {
  var s = String(text || '').replace(/[０-９]/g, function (d) {
    return String.fromCharCode(d.charCodeAt(0) - 0xFEE0);
  });
  var out = [];
  (s.match(/\d+/g) || []).forEach(function (n) {
    var i = parseInt(n, 10) - 1;
    if (i >= 0 && i < max && out.indexOf(i) < 0) out.push(i);
  });
  return out.sort(function (a, b) { return a - b; });
}

/**
 * X_投稿案 から、直近に作った1回ぶんを読む。
 * 「枠」列があればそれを枠番号にし、無ければ行の順にする（古い行のため）。
 * @return {Array<Object>} 見出し名をキーにした投稿（_idx, _state つき）
 */
function xLatestBatch_() {
  var sh = xBook_().getSheetByName(X_SHEETS.DRAFT);
  if (!sh || sh.getLastRow() < 2) return [];
  xRepairHeaders_(sh, X_DRAFT_HEADERS);

  var width = Math.max(sh.getLastColumn(), X_DRAFT_HEADERS.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v).trim(); });
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var stampCol = head.indexOf('作成日時');
  var latest = String(values[values.length - 1][stampCol]);

  var rows = values.filter(function (r) { return String(r[stampCol]) === latest; });
  return rows.map(function (r, i) {
    var p = {};
    head.forEach(function (h, c) { if (h) p[h] = r[c]; });
    var slot = parseInt(p['枠'], 10);
    p._idx = isNaN(slot) ? i : slot - 1;
    p._state = String(p['状態'] || '').trim();
    return p;
  });
}

// ===== 25_XPlan.js =====

/**
 * 25_XPlan.js
 * 書く前に、1週間ぶんの企画を決める
 *
 * 7本を2本ずつ並列で書くと、別々の回が同じ返信・同じ主張を使っても気づけない。
 * 最後の編集で外すと、外した分だけ材料が減って枠が空く。
 * なので、書く前に1回だけ「企画会議」をして、1本ごとに
 *   使う材料（返信 R番号・今週あったこと M番号）／題材／主張
 * を決めてから書かせる。
 *
 * 本人のルール
 *   ・1週間に同じ主張は原則1本（長文と短文で同じ主張を言い直さない）
 *   ・同じエピソード・同じ人物の話は1本
 *   ・業務改善・仕組み化は週2本まで
 *   ・材料は今週の返信・引用を優先。方向性シートは軸の確認だけ
 */

/**
 * 1週間ぶんの企画を決める。失敗したら null（従来どおり各回に任せる）。
 * @param {Object} ctx xGenCtx_ の戻り値
 * @return {Array<Object>|null} 枠ごとの企画 [{ materials:[{no,text}], subject, plan, claim }]
 */
function xPlanWeek_(ctx) {
  var replies = ctx.replyList || [];
  var notes = ctx.noteList || [];
  var count = ctx.count;

  var lines = [];
  lines.push('# 今週の材料');
  lines.push('## 返信・引用');
  lines.push(replies.length ? xFormatReplies_(replies) : '（なし）');
  lines.push('## 今週あったこと（本人のメモ）');
  lines.push(notes.length ? notes.map(function (n) { return '- [' + n.no + '] ' + n.text; }).join('\n') : '（なし）');
  lines.push('');

  lines.push('# 枠（' + count + '本）');
  for (var i = 0; i < count; i++) {
    var slot = ctx.plan[i];
    var line = '・' + (i + 1) + '本目';
    if (slot) {
      line += '（' + slot.date + '）: ' + (slot.len || '長文');
      if (slot.cat) line += ' / 分類=' + slot.cat;
      if (slot.memo) line += ' / メモ=' + slot.memo;
    }
    var role = ctx.spec.role && ctx.spec.role[i];
    if (role) line += ' / 役割の目安=' + role;
    lines.push(line);
  }
  lines.push('');

  if (ctx.pastThemes && ctx.pastThemes.length) {
    lines.push('# すでに書いたテーマ（同じ結論に戻らない）');
    ctx.pastThemes.slice(0, 20).forEach(function (t) { lines.push('  ・' + t); });
    lines.push('');
  }

  var res = xClaudeBatch_([{
    system: xPlanSystem_(count),
    userText: ctx.context + '\n' + lines.join('\n'),
    maxTokens: 16000,
    effort: 'medium'
  }])[0];

  if (!res || !res.ok) {
    Logger.log('週の企画に失敗（各回に任せます）: ' + ((res && res.error) || '不明'));
    return null;
  }

  var json;
  try { json = xParseJson_(res.text); } catch (e) {
    Logger.log('週の企画の返答を読めませんでした（各回に任せます）: ' + e.message);
    return null;
  }

  var find = function (key) {
    var k = String(key || '').trim();
    var m = k.match(/^([RM])\s*(\d+)$/i);
    if (!m) return null;
    var list = m[1].toUpperCase() === 'R' ? replies : notes;
    return list.filter(function (x) { return x.no === m[1].toUpperCase() + m[2]; })[0] || null;
  };

  var out = [];
  for (var j = 0; j < count; j++) out.push(null);
  var usedMaterial = {};

  (json['枠'] || []).forEach(function (f) {
    var idx = parseInt(f['本'], 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= count || out[idx]) return;
    var mats = [];
    (f['材料'] || []).forEach(function (k) {
      var m = find(k);
      // 同じ材料を2枠で使わない（企画の段階で重なりを防ぐ）
      if (m && !usedMaterial[m.no]) { usedMaterial[m.no] = true; mats.push(m); }
    });
    out[idx] = {
      materials: mats,
      subject: xNormSubject_(f['題材']),
      plan: String(f['企画'] || ''),
      claim: String(f['主張'] || '')
    };
  });

  var filled = out.filter(Boolean).length;
  if (!filled) {
    Logger.log('週の企画が空でした（各回に任せます）');
    return null;
  }

  // 企画が無い枠・材料も題材も無い枠には、題材を割り振る
  var pseudo = [];
  out.forEach(function (p, i) {
    if (!p) out[i] = p = { materials: [], subject: '', plan: '', claim: '' };
    if (!p.materials.length && !p.subject) pseudo.push({ idx: i, material: null, subject: '' });
  });
  if (pseudo.length) {
    var usedPosts = out.map(function (p, i) { return { _idx: i, '題材': p.subject }; })
      .filter(function (p) { return p['題材']; });
    xAssignSubjects_(pseudo, usedPosts);
    pseudo.forEach(function (r) { out[r.idx].subject = r.subject; });
  }

  Logger.log('週の企画: ' + out.map(function (p, i) {
    return (i + 1) + '本目=' + (p.materials.length ? p.materials.map(function (m) { return m.no; }).join('+') : '題材:' + p.subject) +
      (p.claim ? '「' + p.claim.slice(0, 20) + '」' : '');
  }).join(' / '));
  return out;
}

/** 企画会議の指示 */
function xPlanSystem_(count) {
  return [
    'あなたは、ある書き手のXアカウントの編集者です。',
    'これから' + count + '本の投稿を書く前に、1週間ぶんの企画を決めます。文章はまだ書きません。',
    '',
    '■ いちばん大事なルール：1週間に同じ主張は原則1本',
    '・同じ主張（同じ結論・同じ言いたいこと）の投稿を2本にしないでください。',
    '  長文と短文で同じ主張を言い直すのも、同じ主張の2本として扱います。',
    '・同じエピソード・同じ人物の話は1本にまとめてください。',
    '  同じ出来事について書いた返信が複数あるなら、それらは1本の材料にまとめます。',
    '・同じ材料（返信・メモ）を2本で使わないでください。',
    '',
    '■ 材料',
    '・今週の返信・引用・今週あったことを優先してください。',
    '・事業の方向性シートは、軸から外れていないかの確認だけに使います。そこからテーマを作らないでください。',
    '・材料が足りない枠は、材料を空にして "題材" を1つ決めてください。',
    '  題材: ' + X_SUBJECTS.join('・') + '（「これからやりたい仕事」は週1本まで）',
    '  「これからやりたい仕事」は実績ではなく「こうしたい」「こう考えている」で書く前提です。',
    '',
    '■ 題材の幅',
    '・業務改善・仕組み化の話は週に' + X_SYSTEM_TOPIC_MAX + '本まで。',
    '・仕事の考え方・実務の視点・人柄・日常の気づきなど、題材に幅を持たせてください。',
    '・役割の目安と分類は参考です。材料に合わなければ変えて構いません。',
    '',
    '■ 主張',
    '・1本につき1つ。1文で。元の返信より強く言い切らないでください。',
    '・実績や相談者の発言を前提にした主張にしないでください。',
    '',
    '■ 出力（JSONのみ。説明やコードフェンスは付けない）',
    '{"枠": [',
    '  {"本": 1, "材料": ["R2", "R3"], "題材": "", "企画": "30字以内", "主張": "1文"},',
    '  {"本": 2, "材料": [], "題材": "人柄", "企画": "…", "主張": "…"}',
    ']}',
    '本の番号は 1 から ' + count + ' まで、すべての枠を入れてください。'
  ].join('\n');
}

/**
 * 執筆の依頼に添える「この回の企画」と「他の本の主張」。
 * @param {Array<Object>} weekPlan xPlanWeek_ の戻り値
 * @param {number} from この回の最初の枠（0始まり）
 * @param {number} n この回の本数
 * @return {string}
 */
function xPlanText_(weekPlan, from, n) {
  if (!weekPlan) return '';
  var parts = [];
  parts.push('');
  parts.push('## この回の企画（1週間ぶんを先に決めてあります。変えないでください）');
  for (var i = from; i < from + n; i++) {
    var p = weekPlan[i];
    if (!p) continue;
    parts.push('### ' + (i + 1) + '本目');
    if (p.plan) parts.push('企画: ' + p.plan);
    if (p.claim) parts.push('主張: ' + p.claim);
    if (p.materials.length) {
      parts.push('使う材料（これだけを使う）:');
      p.materials.forEach(function (m) { parts.push('  [' + m.no + '] ' + m.text); });
    } else {
      parts.push('題材: ' + (p.subject || '仕事の考え方'));
      parts.push('今週の材料はこの枠にはありません。この書き手が今後大切にしたい考え方・仕事の方針として書いてください。');
      parts.push('実績、相談者・お客様の発言は作らないでください。');
    }
  }

  var others = [];
  weekPlan.forEach(function (p, i) {
    if (!p || (i >= from && i < from + n)) return;
    var used = p.materials.map(function (m) { return m.no; }).join('・');
    others.push('  ・' + (i + 1) + '本目: ' + (p.claim || p.plan || p.subject || '') + (used ? '（材料 ' + used + '）' : ''));
  });
  if (others.length) {
    parts.push('');
    parts.push('## 同じ週の他の本（この主張を言わない・この材料を使わない）');
    parts = parts.concat(others);
  }
  return parts.join('\n');
}

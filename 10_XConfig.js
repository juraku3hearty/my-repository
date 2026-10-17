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
var X_DRAFT_HEADERS = ['作成日時', '分類', '役割', '使った型', 'ターゲット層', 'テーマ',
  '投稿の狙い', '元になった返信・切り口', '本文', '冒頭3行', '事実確認が必要な箇所',
  '自己チェック', '投稿予定日', '状態'];

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

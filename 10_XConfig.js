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
 * X_文体ルール の「区分」。
 *
 * 文体ルールには、書き方（文体）と、過去に書いた中身（テーマ・主張）が一緒に入っていた。
 * 中身まで「文体」として毎回渡すと、新しい材料でも過去と同じ結論に寄っていく。
 * なので行ごとに区分を付け、生成での使い方を分ける。
 *
 *   文体                  … 語尾・改行・言葉遣い・禁止表現など。生成で必ず守る
 *   軸・価値観            … 本人が大切にしている考え方。企画の方向性の判断に使う（毎回そこに着地させない）
 *   過去の主張・エピソード … これまでに言ってきたこと。焼き直し防止に使う
 *   使わない              … 生成に渡さない（型カタログと重複する「構成の型」など）
 */
var X_RULE_KIND = { STYLE: '文体', AXIS: '軸・価値観', PAST: '過去の主張・エピソード', OFF: '使わない' };

/** 区分が空の行に入れる既定値。ここに無い項目は、文体を壊さないよう「文体」扱いにする */
var X_RULE_KIND_DEFAULTS = {
  '禁止語': '文体', '採用語': '文体', '文の長さ': '文体', '改行': '文体', '語尾': '文体', '一人称': '文体',
  '冒頭パターン': '文体', 'CTAパターン': '文体', '具体例の出し方': '文体',
  '守るべきこと': '文体', 'やってはいけないこと': '文体',
  '繰り返している主張': '過去の主張・エピソード',
  'よく書くテーマ': '過去の主張・エピソード',
  '雛形にあったテーマ': '過去の主張・エピソード',
  '構成の型': '使わない'
};

/** X_文体ルール の列 */
var X_RULE_HEADERS = ['項目', '内容', 'メモ（手で直してください）', '区分'];

/** 最初から入れておく「軸・価値観」の行（本人が挙げたもの） */
var X_DEFAULT_AXIS_ROW = ['発信の軸・価値観', '社長語を、現場語に',
  '大切にしている考え方を1行ずつ。企画の方向性の判断に使う。毎回この結論に着地させる必要はない', '軸・価値観'];

/**
 * 生成の方式。X_設定「生成の方式」で切り替える。
 *   改修後 … 文体ルールを区分ごとに分けて渡し、言い切りの基準を整理した方式（既定）
 *   改修前 … 以前の方式（文体ルールを全部「文体ルール」として渡す）
 */
var X_GEN_MODE = { NEW: '改修後', OLD: '改修前' };

/**
 * 企画の方式。X_設定「企画の方式」で切り替える。
 *   材料に合わせる … 企画会議が材料を見て、芯・締め方・型・角度・役割を1本ずつ選ぶ（既定）
 *   先行割り当て   … 以前の方式（型・角度・役割を、何本目かの順に先に配る）
 */
var X_PLAN_MODE = { NEW: '材料に合わせる', OLD: '先行割り当て' };

/** 企画の方式を決める。override があればそれを使う（比較用） */
function xPlanMode_(setting, override) {
  var v = String(override || (setting && setting['企画の方式']) || '').trim();
  return v === X_PLAN_MODE.OLD ? X_PLAN_MODE.OLD : X_PLAN_MODE.NEW;
}

/**
 * 投稿の芯。企画会議が材料を見て1本ずつ選ぶ（材料に合わせる方式のとき）。
 * 場面・感情は、材料にその場面や気持ちが書かれているときだけ選べる（創作しないため）。
 */
var X_CORE_TYPES = [
  { name: '主張', desc: '書き手が考えていることをはっきり言う', close: '主張で終える' },
  { name: '場面', desc: '実際にあった1場面を見せる（材料に場面が書かれているときだけ）', close: '場面で止める。教訓や問いを足さない' },
  { name: '問い', desc: '答えを出さずに問いを置く', close: '問いで終える' },
  { name: '感情', desc: 'そのとき感じたことをそのまま書く（材料に気持ちが書かれているときだけ）', close: '気持ちのまま終える。教訓を足さない' },
  { name: '観察', desc: '見たこと・気づいたことを、結論を急がずに書く', close: '見たことで止める。結論を足さない' }
];

/** 自己表明の締め（〜したい／〜と思っています／〜と考えています）とみなす最後の一文 */
var X_SELF_STATEMENT_END = /(たい|たいです|たいと思っています|たいと思う|と思っています|と考えています|していきたい|していきます)[。！!]?$/;

/** 週の中で、同じ読後感・問いの締め・自己表明の締め・カギカッコ始まりを何本まで許すか */
var X_WEEK_LIMITS = { feel: 2, question: 2, selfStatement: 2, quote: 2 };

/** 生成の方式を決める。override があればそれを使う（改修前後の比較用） */
function xGenMode_(setting, override) {
  var v = String(override || (setting && setting['生成の方式']) || '').trim();
  return v === X_GEN_MODE.OLD ? X_GEN_MODE.OLD : X_GEN_MODE.NEW;
}

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
var X_DRAFT_HEADERS = ['作成日時', '枠', '分類', '役割', '芯', '読後感', '使った型', 'ターゲット層', 'テーマ',
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

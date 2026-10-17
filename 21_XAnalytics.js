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
 * @param {number} days 何日ぶん
 * @return {string}
 */
function xReadRecentReplies_(days) {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var rows = values.filter(function (r) {
    return /^Xでの(返信|引用)/.test(String(r[1])) && String(r[3]).trim();
  });
  if (!rows.length) return '';

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
  return picked.map(function (x) {
    var d = x.d ? Utilities.formatDate(x.d, 'Asia/Tokyo', 'M/d') : '';
    return '- [' + d + '・' + String(x.r[1]).replace(/^Xでの/, '') + '] ' + String(x.r[3]).trim();
  }).join('\n');
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

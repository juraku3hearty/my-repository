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

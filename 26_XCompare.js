/**
 * 26_XCompare.js
 * 改修前後の比較
 *
 * 同じ材料（返信・今週あったこと・週の傾向・型の割り当て）から、
 * 「改修前」と「改修後」の方式で7本ずつ作り、並べて比べる。
 *
 * ・投稿案シート・週形式シートには書かない（いつもの投稿案を汚さないため）
 * ・企画と執筆まで（週の編集・作り直しはしない）。編集は今回変えていないので、
 *   執筆までの差だけを見るほうが比べやすい
 * ・機械で数えられる目安と、AIによる比較（どちらが改修後かを伏せて評価）を出す。
 *   最後に判断するのは本人なので、本人が書き込む欄も作る
 */

var X_COMPARE_SHEET = 'X_改修比較';

/** AIの比較を始めてよい経過時間（GASの6分制限のため） */
var X_COMPARE_JUDGE_LIMIT_MS = 4.2 * 60 * 1000;

/**
 * メニューから呼ぶ。
 */
function xCompareModes() {
  var t0 = Date.now();
  var count = 7;

  var ctxOld = xGenCtx_('', count, X_GEN_MODE.OLD);
  var ctxNew = xGenCtx_('', count, X_GEN_MODE.NEW);
  // 経過時間は、比較全体の開始から数える
  ctxOld.started = ctxNew.started = t0;

  // 1) 企画会議を2つ同時に
  var plans = xClaudeBatch_([xPlanRequest_(ctxOld), xPlanRequest_(ctxNew)]);
  ctxOld.weekPlan = xPlanParse_(ctxOld, plans[0]);
  ctxNew.weekPlan = xPlanParse_(ctxNew, plans[1]);

  // 2) 執筆を、2つの方式ぶんまとめて同時に
  var gOld = xGenJobs_(ctxOld), gNew = xGenJobs_(ctxNew);
  var res = xClaudeBatch_(gOld.reqs.concat(gNew.reqs));
  var cOld = xGenCollect_(ctxOld, gOld.jobs, res.slice(0, gOld.reqs.length));
  var cNew = xGenCollect_(ctxNew, gNew.jobs, res.slice(gOld.reqs.length));

  // 落ちた枠の作り直しも、まとめて
  if ((cOld.failed.length || cNew.failed.length) && Date.now() - t0 < X_GEN_TIME_LIMIT_MS) {
    var rOld = xGenRetryReqs_(ctxOld, cOld.failed), rNew = xGenRetryReqs_(ctxNew, cNew.failed);
    var rr = xClaudeBatch_(rOld.concat(rNew));
    xGenCollectRetry_(ctxOld, cOld.failed, rr.slice(0, rOld.length), cOld.all);
    xGenCollectRetry_(ctxNew, cNew.failed, rr.slice(rOld.length), cNew.all);
  }
  var postsOld = xBySlot_(xGenFinish_(ctxOld, cOld.all), count);
  var postsNew = xBySlot_(xGenFinish_(ctxNew, cNew.all), count);

  // 3) 機械で数える目安
  var parts = xReadRuleParts_();
  var mOld = xCompareMetrics_(postsOld, parts.past);
  var mNew = xCompareMetrics_(postsNew, parts.past);

  // 4) AIによる比較（時間があれば）
  var judge = null;
  if (Date.now() - t0 < X_COMPARE_JUDGE_LIMIT_MS) {
    judge = xCompareJudge_(parts, postsOld, postsNew);
  } else {
    Logger.log('時間の都合で、AIによる比較は省きました。');
  }

  xWriteCompare_(ctxNew, postsOld, postsNew, mOld, mNew, judge);

  var msg = '改修前後を7本ずつ作って並べました（' + Math.round((Date.now() - t0) / 1000) + '秒）。' +
    X_COMPARE_SHEET + ' を見てください。' + (judge ? '' : '（AIによる比較は時間の都合で省略）');
  Logger.log(msg);
  xToast_(msg);
}

/** 本文の最初の一文（1行目） */
function xFirstLine_(body) {
  var lines = String(body || '').split('\n').map(function (x) { return x.trim(); }).filter(String);
  return lines[0] || '';
}

/** 本文の最後の一文（最後の行） */
function xLastLine_(body) {
  var lines = String(body || '').split('\n').map(function (x) { return x.trim(); }).filter(String);
  return lines.length ? lines[lines.length - 1] : '';
}

/** 2文字ずつの組の重なり（0〜1）。似ているかの目安 */
function xBigramSim_(a, b) {
  var grams = function (t) {
    var s = String(t || '').replace(/[\s、。！？!?「」『』（）()・…]/g, '');
    var out = {};
    for (var i = 0; i < s.length - 1; i++) out[s.substr(i, 2)] = true;
    return out;
  };
  var A = grams(a), B = grams(b);
  var ka = Object.keys(A), kb = Object.keys(B);
  if (!ka.length || !kb.length) return 0;
  var inter = ka.filter(function (k) { return B[k]; }).length;
  return inter / (ka.length + kb.length - inter);
}

/**
 * 機械で数えられる目安。あくまで目安で、良し悪しは本人とAIの比較で見る。
 * @param {Array<Object>} posts 枠順の投稿
 * @param {string} pastText 過去の主張（文体ルールの「過去の主張・エピソード」）
 */
function xCompareMetrics_(posts, pastText) {
  var bodies = posts.map(function (p) { return String(p['本文'] || ''); }).filter(function (b) { return b.trim(); });
  var heads = bodies.map(xFirstLine_);
  var tails = bodies.map(xLastLine_);
  var count = function (re) {
    return bodies.reduce(function (n, b) { return n + ((b.match(re) || []).length); }, 0);
  };

  // 締めどうしの似ている組
  var simPairs = 0, simSum = 0, pairN = 0;
  for (var i = 0; i < tails.length; i++) {
    for (var j = i + 1; j < tails.length; j++) {
      var sim = xBigramSim_(tails[i], tails[j]);
      simSum += sim; pairN++;
      if (sim >= 0.35) simPairs++;
    }
  }
  var sameHead = 0;
  for (var a = 0; a < heads.length; a++) {
    for (var b = a + 1; b < heads.length; b++) {
      if (heads[a].slice(0, 5) && heads[a].slice(0, 5) === heads[b].slice(0, 5)) sameHead++;
    }
  }

  // 過去の主張に近い本（どれかの文が、過去の主張のどれかとよく似ている）
  var past = String(pastText || '').split('\n')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x && !/^【/.test(x) && x.length >= 6; });
  var nearPast = bodies.filter(function (b) {
    var sentences = b.split(/[。\n！？!?]/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; });
    return sentences.some(function (s) {
      return past.some(function (p) { return xBigramSim_(s, p) >= 0.4; });
    });
  }).length;

  var banned = [];
  try { banned = xBannedWords_(); } catch (e) { banned = []; }
  var known = '';
  try { known = xKnownFactsText_(); } catch (e2) { known = ''; }
  var setting = xReadSetting_();
  var landings = xSettingLines_(setting, '禁止する着地', X_DEFAULT_BANNED_LANDINGS);

  return {
    '本数': bodies.length,
    '平均の文字数': bodies.length ? Math.round(bodies.reduce(function (n, x) { return n + x.length; }, 0) / bodies.length) : 0,
    '冒頭がカギカッコの本': heads.filter(function (h) { return /^[「『]/.test(h); }).length,
    '書き出し5字が同じ組': sameHead,
    '締めが問いかけ（？）の本': tails.filter(function (t) { return /[？?]$/.test(t); }).length,
    '締めに「大切・大事・必要」がある本': tails.filter(function (t) { return /大切|大事|必要/.test(t); }).length,
    '締めどうしが似ている組': simPairs,
    '締めどうしの似ている度合い（平均）': pairN ? Math.round(simSum / pairN * 100) / 100 : 0,
    '過去の主張に近い文がある本': nearPast,
    '留保の言い回し（かもしれません・気がします 等）': count(/かもしれません|気がします|たぶん|だったりします|と思います|かなと/g),
    '一般論の言い切り語（9割・絶対・本質は 等）': count(/9割|九割|ほぼ全員|絶対|本質は|誰でも|みんな|決め手/g),
    '出どころ未確認の数字': bodies.reduce(function (n, x) { return n + xUnknownNumbers_(x, known).length; }, 0),
    '禁止語': bodies.reduce(function (n, x) { return n + banned.filter(function (w) { return x.indexOf(w) >= 0; }).length; }, 0),
    '禁止した着地': bodies.reduce(function (n, x) { return n + landings.filter(function (w) { return x.indexOf(w) >= 0; }).length; }, 0),
    '本文に残った【要確認】': count(/【要確認/g),
    '事実確認の質問がある本': posts.filter(function (p) {
      var q = String(p['事実確認が必要な箇所'] || '').trim();
      return String(p['本文'] || '').trim() && q && q !== 'なし';
    }).length
  };
}

/** 目安の見方（シートに添える） */
var X_COMPARE_HINTS = {
  '冒頭がカギカッコの本': '少ないほど冒頭がばらけている',
  '書き出し5字が同じ組': '少ないほど冒頭がばらけている',
  '締めが問いかけ（？）の本': '多すぎると締めがそろう',
  '締めに「大切・大事・必要」がある本': '多いほど教訓で締めている',
  '締めどうしが似ている組': '少ないほど結論がばらけている',
  '締めどうしの似ている度合い（平均）': '0に近いほど結論がばらけている',
  '過去の主張に近い文がある本': '少ないほど焼き直しが少ない',
  '留保の言い回し（かもしれません・気がします 等）': '減っていれば言い切りが増えた（根拠のない断定でないかはAI比較と本人の目で）',
  '一般論の言い切り語（9割・絶対・本質は 等）': '0が望ましい',
  '出どころ未確認の数字': '0が望ましい',
  '禁止語': '0が望ましい（文体が崩れていないかの目安）',
  '禁止した着地': '0が望ましい',
  '本文に残った【要確認】': '0が望ましい',
  '事実確認の質問がある本': '多いほど本人の確認の手間が増える'
};

/**
 * AIによる比較。どちらが改修後かは伏せて、XとYで渡す。
 * @return {Object|null} 改修前/改修後に読み替えた結果
 */
function xCompareJudge_(parts, postsOld, postsNew) {
  var swap = Math.random() < 0.5;   // true なら X=改修後
  var X = swap ? postsNew : postsOld;
  var Y = swap ? postsOld : postsNew;
  var list = function (posts) {
    return posts.map(function (p, i) {
      return '## ' + (i + 1) + '本目\n' + (String(p['本文'] || '').trim() || '（空き）');
    }).join('\n\n');
  };

  var system = [
    'あなたは、ある書き手のXの投稿案を比べる編集者です。',
    '同じ材料から、2つの方法（X と Y）で7本ずつ作りました。どちらが新しい方法かは伏せています。',
    '先入観を持たず、次の5つの観点で比べてください。',
    '',
    '1. 文体：下の「文体ルール」に照らして、どちらがこの書き手らしいか',
    '2. 結論の似通い：7本の結論・読後感が似ていないか。「過去の主張」と同じ結論に寄っていないか',
    '3. 根拠のない断定：他人の気持ち・一般論・未確認の成果を断定している箇所、',
    '   本人が言っていない因果関係や成果を付け加えている箇所を、本文から引用して挙げる',
    '   （本人の経験・本人の考え・本人の方針をはっきり書いているのは、根拠のない断定ではありません）',
    '4. 冒頭と締め：7本の書き出しと締めに変化があるか',
    '5. 編集の手間：本人がそのまま使うために直す必要がある箇所の数（1本ごと）',
    '',
    '出力はJSONのみ。説明文やコードフェンスは付けないでください。',
    '{',
    '  "文体": {"より良い": "X か Y か 同じ", "理由": "…"},',
    '  "結論の似通い": {"少ない": "X か Y か 同じ", "Xの傾向": "…", "Yの傾向": "…"},',
    '  "根拠のない断定": {"X": [{"本": 1, "箇所": "引用", "種類": "他人の気持ち／一般論／未確認の成果／言っていない因果・成果"}], "Y": []},',
    '  "冒頭と締め": {"変化が大きい": "X か Y か 同じ", "理由": "…"},',
    '  "編集の手間": {"X": [0,0,0,0,0,0,0], "Y": [0,0,0,0,0,0,0], "理由": "…"},',
    '  "総評": "どちらをどう良いと見るか。200字以内"',
    '}'
  ].join('\n');

  var user = [
    '# 文体ルール（この書き手の書き方）',
    parts.style,
    '',
    '# 過去の主張（これまでに何度も言ってきたこと）',
    parts.past || '（なし）',
    '',
    '# X',
    list(X),
    '',
    '# Y',
    list(Y)
  ].join('\n');

  var res = xClaudeBatch_([{ system: system, userText: user, maxTokens: 16000, effort: 'high' }])[0];
  if (!res || !res.ok) { Logger.log('AIによる比較に失敗: ' + ((res && res.error) || '不明')); return null; }

  var j;
  try { j = xParseJson_(res.text); } catch (e) { Logger.log('AIによる比較を読めませんでした: ' + e.message); return null; }

  // X/Y を 改修前/改修後 に読み替える
  var name = function (v) {
    v = String(v || '').trim();
    if (v === 'X') return swap ? '改修後' : '改修前';
    if (v === 'Y') return swap ? '改修前' : '改修後';
    return v || '—';
  };
  var pick = function (o, k) { return (o || {})[k]; };
  var asOldNew = function (o) {
    return { old: pick(o, swap ? 'Y' : 'X'), neu: pick(o, swap ? 'X' : 'Y') };
  };
  var conc = j['結論の似通い'] || {};
  var flags = asOldNew(j['根拠のない断定']);
  var edits = asOldNew(j['編集の手間']);
  var sum = function (a) { return (a || []).reduce(function (n, x) { return n + (Number(x) || 0); }, 0); };

  return {
    style: { better: name(pick(j['文体'], 'より良い')), why: String(pick(j['文体'], '理由') || '') },
    conclusion: {
      fewer: name(conc['少ない']),
      old: String(conc[swap ? 'Yの傾向' : 'Xの傾向'] || ''),
      neu: String(conc[swap ? 'Xの傾向' : 'Yの傾向'] || '')
    },
    overclaim: { old: flags.old || [], neu: flags.neu || [] },
    openClose: { more: name(pick(j['冒頭と締め'], '変化が大きい')), why: String(pick(j['冒頭と締め'], '理由') || '') },
    edits: { old: sum(edits.old), neu: sum(edits.neu), why: String(pick(j['編集の手間'], '理由') || '') },
    summary: String(j['総評'] || '').replace(/\bX\b/g, swap ? '改修後' : '改修前').replace(/\bY\b/g, swap ? '改修前' : '改修後')
  };
}

/** 比較結果をシートに書く */
function xWriteCompare_(ctx, postsOld, postsNew, mOld, mNew, judge) {
  var sh = xSheet_(X_COMPARE_SHEET, []);
  sh.clearContents();
  var W = 7;
  var pad = function (row) { while (row.length < W) row.push(''); return row; };
  var out = [];
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

  out.push(pad(['改修前後の比較（' + now + '）']));
  out.push(pad(['同じ材料（今週の返信・今週あったこと・週の傾向・型の割り当て）から、2つの方式で7本ずつ作りました。週の編集・作り直しはしていません。']));
  out.push(pad(['改修前＝文体ルールを全部「文体」として渡す／改修後＝文体・軸・過去の主張を分けて渡し、言い切りの基準を整理']));
  out.push(pad(['']));

  // 1. 本文を並べる
  out.push(pad(['■ 1. 本文', '長さ・分類', '改修前 1行目', '改修後 1行目', '改修前 本文', '改修後 本文', '']));
  for (var i = 0; i < postsNew.length; i++) {
    var slot = ctx.plan[i];
    var lab = slot ? ((slot.len || '') + (slot.cat ? '・' + slot.cat : '')) : '';
    out.push(pad([(i + 1) + '本目', lab,
      xFirstLine_(postsOld[i]['本文']), xFirstLine_(postsNew[i]['本文']),
      String(postsOld[i]['本文'] || ''), String(postsNew[i]['本文'] || '')]));
  }
  out.push(pad(['']));
  out.push(pad(['■ 締めの一文', '', '改修前', '改修後']));
  for (var t = 0; t < postsNew.length; t++) {
    out.push(pad([(t + 1) + '本目', '', xLastLine_(postsOld[t]['本文']), xLastLine_(postsNew[t]['本文'])]));
  }
  out.push(pad(['']));

  // 2. 目安
  out.push(pad(['■ 2. 機械で数えた目安', '', '改修前', '改修後', '見方']));
  Object.keys(mNew).forEach(function (k) {
    out.push(pad([k, '', mOld[k], mNew[k], X_COMPARE_HINTS[k] || '']));
  });
  out.push(pad(['']));

  // 3. AIの比較
  out.push(pad(['■ 3. AIによる比較（どちらが改修後かを伏せて評価）', '', '', '', '']));
  if (judge) {
    out.push(pad(['私らしい文体が保たれているか', 'より良い: ' + judge.style.better, judge.style.why]));
    out.push(pad(['似た結論に寄る傾向が減ったか', '少ない: ' + judge.conclusion.fewer, '改修前: ' + judge.conclusion.old, '改修後: ' + judge.conclusion.neu]));
    out.push(pad(['根拠のない断定が増えていないか', '改修前 ' + judge.overclaim.old.length + '箇所／改修後 ' + judge.overclaim.neu.length + '箇所',
      xFormatClaims_(judge.overclaim.old), xFormatClaims_(judge.overclaim.neu)]));
    out.push(pad(['冒頭や締めに変化が出たか', '変化が大きい: ' + judge.openClose.more, judge.openClose.why]));
    out.push(pad(['編集する負担が増えていないか', '直す箇所 改修前 ' + judge.edits.old + '／改修後 ' + judge.edits.neu, judge.edits.why]));
    out.push(pad(['総評', judge.summary]));
  } else {
    out.push(pad(['（時間の都合で省略しました。もう一度押すとやり直せます）']));
  }
  out.push(pad(['']));

  // 4. 本人の判定
  out.push(pad(['■ 4. あなたの判定（ここに書き込んでください）', '', '改修前', '改修後', 'メモ']));
  ['私らしい文体が保たれているか', '似た結論に寄る傾向が減ったか', '根拠のない断定が増えていないか',
   '冒頭や締めに変化が出たか', '私が編集する負担が増えていないか', '「おっ」と思った本の数'].forEach(function (k) {
    out.push(pad([k, '', '', '', '']));
  });

  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(3, 260);
  sh.setColumnWidth(4, 260);
  sh.setColumnWidth(5, 420);
  sh.setColumnWidth(6, 420);
  sh.getRange(1, 1, out.length, W).setWrap(true).setVerticalAlignment('top');
}

/** 根拠のない断定の一覧を1セルに */
function xFormatClaims_(list) {
  return (list || []).map(function (c) {
    return (c['本'] ? c['本'] + '本目 ' : '') + '「' + String(c['箇所'] || '').slice(0, 50) + '」（' + (c['種類'] || '') + '）';
  }).join('\n');
}

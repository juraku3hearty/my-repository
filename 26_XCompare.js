/**
 * 26_XCompare.js
 * 企画の方式の比較（同じ材料で7本ずつ）
 *
 * 同じ材料（返信・今週あったこと・週の傾向）から、
 *   今の方式（先行割り当て：型・角度・役割を順に配る）
 *   新しい方式（材料に合わせる：企画会議が芯・締め方・型・角度・役割を選ぶ）
 * で7本ずつ作り、両方とも週の編集まで通してから並べて比べる。
 * 文体の分離（生成の方式＝改修後）は両方とも同じ。
 *
 * 週の編集まで通すと、GASの6分制限を超えるので、4段階に分けて自動で続ける。
 *   1. 企画会議と執筆（2つの方式を同時に）
 *   2. 今の方式の週の編集
 *   3. 新しい方式の週の編集
 *   4. 機械の目安・AIの比較・書き出し
 * 途中の結果は X_比較作業 シートに置き、時間で動くトリガーで次の段階を呼ぶ。
 *
 * 比べたいのは「形式的に違う7本」ではなく「実際に読んで面白いと思える7本」。
 * なので数値だけでなく、7本の企画そのもの（芯・芯になる一文・材料・採用しなかった材料）も並べる。
 * 投稿案シート・週形式シートには書かない。
 */

var X_COMPARE_SHEET = 'X_改修比較';
var X_COMPARE_WORK = 'X_比較作業';
var X_COMPARE_HANDLER = 'xCompareContinue';

/** 比べる2つ */
var X_COMPARE_SIDES = [
  { key: 'A', label: '今の方式（先行割り当て）', mode: '改修後', plan: '先行割り当て' },
  { key: 'B', label: '新しい方式（材料に合わせる）', mode: '改修後', plan: '材料に合わせる' }
];

var X_COMPARE_STEPS = ['gen', 'editA', 'editB', 'judge'];
var X_COMPARE_STEP_LABEL = {
  gen: '1/4 企画会議と執筆（2つの方式を同時に）',
  editA: '2/4 今の方式の週の編集',
  editB: '3/4 新しい方式の週の編集',
  judge: '4/4 機械の目安・AIの比較・書き出し'
};

/**
 * メニューから呼ぶ。最初の段階をこの場で実行し、残りは自動で続ける。
 */
function xCompareModes() {
  xCompareClearTriggers_();
  xCompareWorkReset_();
  xCompareWorkSet_('step', 'gen');
  xCompareWorkSet_('startedAt', String(Date.now()));
  xCompareStatus_('比較を始めました。' + X_COMPARE_STEP_LABEL.gen + '…（全部で10分ほど。シートを閉じても進みます）');
  xCompareRunStep_();
}

/** トリガーから呼ばれる（名前の末尾に _ を付けない：トリガーから呼べなくなるため） */
function xCompareContinue() {
  xCompareClearTriggers_();
  xCompareRunStep_();
}

/** いまの段階を実行し、次があれば予約する */
function xCompareRunStep_() {
  var step = xCompareWorkGet_('step');
  if (!step || step === 'done') return;
  try {
    if (step === 'gen') xCompareStepGen_();
    else if (step === 'editA') xCompareStepEdit_('A');
    else if (step === 'editB') xCompareStepEdit_('B');
    else if (step === 'judge') xCompareStepJudge_();

    var next = X_COMPARE_STEPS[X_COMPARE_STEPS.indexOf(step) + 1] || 'done';
    xCompareWorkSet_('step', next);
    if (next === 'done') {
      var secs = Math.round((Date.now() - Number(xCompareWorkGet_('startedAt') || Date.now())) / 1000);
      var msg = '比較が終わりました（' + Math.round(secs / 60) + '分）。' + X_COMPARE_SHEET + ' を見てください。';
      Logger.log(msg);
      xToast_(msg);
      return;
    }
    xCompareStatus_('比較中: ' + X_COMPARE_STEP_LABEL[next] + '…（シートを閉じても進みます）');
    ScriptApp.newTrigger(X_COMPARE_HANDLER).timeBased().after(20 * 1000).create();
  } catch (e) {
    xCompareWorkSet_('step', 'done');
    xCompareStatus_('比較が途中で止まりました（' + (X_COMPARE_STEP_LABEL[step] || step) + '）: ' + e.message +
      '　もう一度「改修前後を比べる」を押すと最初からやり直します。');
    Logger.log('比較が止まりました: ' + e.message);
  }
}

/** 比較用の材料をそろえる（どの段階でも同じ材料になる） */
function xCompareCtx_(side) {
  var ctx = xGenCtx_('', 7, side.mode, side.plan);
  ctx.started = Date.now();
  return ctx;
}

/** 段階1：企画会議と執筆を、2つの方式ぶん同時に */
function xCompareStepGen_() {
  var t0 = Date.now();
  var ctx = {};
  X_COMPARE_SIDES.forEach(function (s) { ctx[s.key] = xCompareCtx_(s); ctx[s.key].started = t0; });

  // 企画会議（同時）
  var plans = xClaudeBatch_([xPlanRequest_(ctx.A), xPlanRequest_(ctx.B)]);
  ctx.A.weekPlan = xPlanParse_(ctx.A, plans[0]);
  ctx.B.weekPlan = xPlanParse_(ctx.B, plans[1]);
  if (!ctx.A.planUnused) xCompareUnusedFor_(ctx.A);
  if (!ctx.B.planUnused) xCompareUnusedFor_(ctx.B);

  // 執筆（同時）
  var gA = xGenJobs_(ctx.A), gB = xGenJobs_(ctx.B);
  var res = xClaudeBatch_(gA.reqs.concat(gB.reqs));
  var cA = xGenCollect_(ctx.A, gA.jobs, res.slice(0, gA.reqs.length));
  var cB = xGenCollect_(ctx.B, gB.jobs, res.slice(gA.reqs.length));
  if ((cA.failed.length || cB.failed.length) && Date.now() - t0 < X_GEN_TIME_LIMIT_MS) {
    var rA = xGenRetryReqs_(ctx.A, cA.failed), rB = xGenRetryReqs_(ctx.B, cB.failed);
    var rr = xClaudeBatch_(rA.concat(rB));
    xGenCollectRetry_(ctx.A, cA.failed, rr.slice(0, rA.length), cA.all);
    xGenCollectRetry_(ctx.B, cB.failed, rr.slice(rA.length), cB.all);
  }

  [['A', cA], ['B', cB]].forEach(function (x) {
    var c = ctx[x[0]];
    var posts = xGenFinish_(c, x[1].all);
    xCompareWorkSet_(x[0] + '.posts', JSON.stringify(posts));
    xCompareWorkSet_(x[0] + '.plan', JSON.stringify(c.weekPlan));
    xCompareWorkSet_(x[0] + '.unused', JSON.stringify(c.planUnused || []));
    xCompareWorkSet_(x[0] + '.note', c.planNote || '');
    xCompareWorkSet_(x[0] + '.assign', JSON.stringify({
      pattern: c.spec.pattern, role: c.spec.role, quoteOk: c.spec.quoteOk,
      angle: c.spec.pattern.map(function (_, i) { return X_ANGLES[i % X_ANGLES.length]; })
    }));
  });
}

/** 今の方式（先行割り当て）には企画会議の「採用しなかった材料」が無いので、使っていない材料だけ挙げる */
function xCompareUnusedFor_(ctx) {
  var used = {};
  (ctx.weekPlan || []).forEach(function (p) { (p && p.materials || []).forEach(function (m) { used[m.no] = true; }); });
  ctx.planUnused = (ctx.replyList || []).concat(ctx.noteList || []).filter(function (m) { return !used[m.no]; })
    .map(function (m) { return { no: m.no, text: m.text, reason: ctx.weekPlan ? '（この方式は理由を出さない）' : '（企画会議が失敗。各回に任せた）' }; });
}

/** 段階2・3：週の編集 */
function xCompareStepEdit_(key) {
  var side = X_COMPARE_SIDES.filter(function (s) { return s.key === key; })[0];
  var ctx = xCompareCtx_(side);
  ctx.weekPlan = JSON.parse(xCompareWorkGet_(key + '.plan') || 'null');
  xGenMarkPlan_(ctx);
  var posts = JSON.parse(xCompareWorkGet_(key + '.posts') || '[]');
  var edit = xEditWeek_(ctx, posts, null);
  xCompareWorkSet_(key + '.edited', JSON.stringify(edit.posts));
  xCompareWorkSet_(key + '.edit', JSON.stringify({
    replaced: edit.replaced, shortage: edit.shortage, noMaterial: edit.noMaterial, skipped: edit.skipped
  }));
}

/** 段階4：目安・AIの比較・書き出し */
function xCompareStepJudge_() {
  var parts = xReadRuleParts_();
  var ctxB = xCompareCtx_(X_COMPARE_SIDES[1]);
  var d = {};
  X_COMPARE_SIDES.forEach(function (s) {
    var k = s.key;
    d[k] = {
      side: s,
      posts: xBySlot_(JSON.parse(xCompareWorkGet_(k + '.edited') || xCompareWorkGet_(k + '.posts') || '[]'), 7),
      plan: JSON.parse(xCompareWorkGet_(k + '.plan') || 'null'),
      unused: JSON.parse(xCompareWorkGet_(k + '.unused') || '[]'),
      note: xCompareWorkGet_(k + '.note') || '',
      assign: JSON.parse(xCompareWorkGet_(k + '.assign') || '{}'),
      edit: JSON.parse(xCompareWorkGet_(k + '.edit') || '{}')
    };
    d[k].metrics = xCompareMetrics_(d[k].posts, parts.past);
  });
  var judge = xCompareJudge_(parts, d.A.posts, d.B.posts);
  xWriteCompare_(ctxB, d, judge);
}

// ---------- 途中の結果の置き場（X_比較作業） ----------

function xCompareWorkSheet_() {
  var sh = xSheet_(X_COMPARE_WORK, ['項目', '値']);
  try { sh.hideSheet(); } catch (e) { /* 隠せない環境では隠さない */ }
  return sh;
}
function xCompareWorkReset_() {
  var sh = xCompareWorkSheet_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
}
function xCompareWorkGet_(key) {
  var sh = xCompareWorkSheet_();
  if (sh.getLastRow() < 2) return '';
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === key) return String(v[i][1]);
  return '';
}
function xCompareWorkSet_(key, value) {
  var sh = xCompareWorkSheet_();
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var v = sh.getRange(2, 1, n, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][0]) === key) { sh.getRange(i + 2, 2).setValue(value); return; }
    }
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
}

/** 比較の予約（トリガー）を消す */
function xCompareClearTriggers_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === X_COMPARE_HANDLER) ScriptApp.deleteTrigger(t);
    });
  } catch (e) { /* トリガーが使えない環境では何もしない */ }
}

/** 比較シートの1行目に進み具合を出す */
function xCompareStatus_(msg) {
  var sh = xSheet_(X_COMPARE_SHEET, []);
  if (xCompareWorkGet_('step') === 'gen' && msg.indexOf('始めました') >= 0) sh.clearContents();
  sh.getRange(1, 1).setValue(msg);
}

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
    '締めが自己表明（〜したい・〜と思っています）の本': tails.filter(function (t) { return X_SELF_STATEMENT_END.test(t); }).length,
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
  '締めが問いかけ（？）の本': '多すぎると締めがそろう（目安は週2本まで）',
  '締めが自己表明（〜したい・〜と思っています）の本': '多すぎると締めがそろう（目安は週2本まで）',
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

/**
 * AIによる比較。どちらが新しい方式かは伏せて、XとYで渡す。
 * 7本の芯・読後感の振り分けもAIにさせる（今の方式には企画会議の芯が無いので、同じ物差しで数えるため）。
 */
function xCompareJudge_(parts, postsA, postsB) {
  var swap = Math.random() < 0.5;   // true なら X=新しい方式（B）
  var X = swap ? postsB : postsA;
  var Y = swap ? postsA : postsB;
  var list = function (posts) {
    return posts.map(function (p, i) {
      return '## ' + (i + 1) + '本目\n' + (String(p['本文'] || '').trim() || '（空き）');
    }).join('\n\n');
  };

  var system = [
    'あなたは、ある書き手のXの投稿案を比べる編集者です。',
    '同じ材料から、2つの方法（X と Y）で7本ずつ作りました。どちらが新しい方法かは伏せています。',
    '先入観を持たず、比べてください。いちばん大事なのは「形式的に違うか」ではなく「実際に読んで面白いか」です。',
    '',
    '1. 文体：下の「文体ルール」に照らして、どちらがこの書き手らしいか',
    '2. 結論の似通い：7本の結論・読者に残る気づき・読後感が似ていないか。「過去の主張」と同じ結論に寄っていないか',
    '3. 根拠のない断定：他人の気持ち・一般論・未確認の成果を断定している箇所、',
    '   本人が言っていない因果関係や成果を付け加えている箇所を、本文から引用して挙げる',
    '   （本人の経験・本人の考え・本人の方針をはっきり書いているのは、根拠のない断定ではありません）',
    '4. 冒頭と締め：7本の書き出しと締めに変化があるか。日常や人柄の本まで教訓や問いで締めていないか',
    '5. 編集の手間：本人がそのまま使うために直す必要がある箇所の数（1本ごと）',
    '6. 面白さ：1本ごとに ◎（読んで止まる）／○（悪くない）／△（素通りする）。◎と○は、止まる一文を本文から引用',
    '7. 芯と読後感：1本ごとに、芯を「主張・場面・問い・感情・観察」から1つ、読後感を一語で',
    '',
    '出力はJSONのみ。説明文やコードフェンスは付けないでください。',
    '{',
    '  "文体": {"より良い": "X か Y か 同じ", "理由": "…"},',
    '  "結論の似通い": {"少ない": "X か Y か 同じ", "Xの傾向": "…", "Yの傾向": "…"},',
    '  "根拠のない断定": {"X": [{"本": 1, "箇所": "引用", "種類": "他人の気持ち／一般論／未確認の成果／言っていない因果・成果"}], "Y": []},',
    '  "冒頭と締め": {"変化が大きい": "X か Y か 同じ", "理由": "…"},',
    '  "編集の手間": {"X": [0,0,0,0,0,0,0], "Y": [0,0,0,0,0,0,0], "理由": "…"},',
    '  "面白さ": {"X": [{"本": 1, "評価": "◎", "止まる一文": "引用"}], "Y": []},',
    '  "芯": {"X": ["主張","場面","問い","感情","観察","主張","問い"], "Y": []},',
    '  "読後感": {"X": ["しみじみ","…"], "Y": []},',
    '  "総評": "どちらをどう良いと見るか。250字以内"',
    '}'
  ].join('\n');

  var user = [
    '# 文体ルール（この書き手の書き方）', parts.style, '',
    '# 過去の主張（これまでに何度も言ってきたこと）', parts.past || '（なし）', '',
    '# X', list(X), '', '# Y', list(Y)
  ].join('\n');

  var res = xClaudeBatch_([{ system: system, userText: user, maxTokens: 20000, effort: 'high' }])[0];
  if (!res || !res.ok) { Logger.log('AIによる比較に失敗: ' + ((res && res.error) || '不明')); return null; }
  var j;
  try { j = xParseJson_(res.text); } catch (e) { Logger.log('AIによる比較を読めませんでした: ' + e.message); return null; }

  var label = { A: X_COMPARE_SIDES[0].label, B: X_COMPARE_SIDES[1].label };
  var name = function (v) {
    v = String(v || '').trim();
    if (v === 'X') return swap ? label.B : label.A;
    if (v === 'Y') return swap ? label.A : label.B;
    return v || '—';
  };
  var pick = function (o, k) { return (o || {})[k]; };
  var ab = function (o) { return { A: pick(o, swap ? 'Y' : 'X'), B: pick(o, swap ? 'X' : 'Y') }; };
  var sum = function (a) { return (a || []).reduce(function (n, x) { return n + (Number(x) || 0); }, 0); };
  var conc = j['結論の似通い'] || {};

  return {
    style: { better: name(pick(j['文体'], 'より良い')), why: String(pick(j['文体'], '理由') || '') },
    conclusion: { fewer: name(conc['少ない']), A: String(conc[swap ? 'Yの傾向' : 'Xの傾向'] || ''), B: String(conc[swap ? 'Xの傾向' : 'Yの傾向'] || '') },
    overclaim: { A: ab(j['根拠のない断定']).A || [], B: ab(j['根拠のない断定']).B || [] },
    openClose: { more: name(pick(j['冒頭と締め'], '変化が大きい')), why: String(pick(j['冒頭と締め'], '理由') || '') },
    edits: { A: sum(ab(j['編集の手間']).A), B: sum(ab(j['編集の手間']).B), why: String(pick(j['編集の手間'], '理由') || '') },
    fun: { A: ab(j['面白さ']).A || [], B: ab(j['面白さ']).B || [] },
    core: { A: ab(j['芯']).A || [], B: ab(j['芯']).B || [] },
    feel: { A: ab(j['読後感']).A || [], B: ab(j['読後感']).B || [] },
    summary: String(j['総評'] || '').replace(/\bX\b/g, swap ? label.B : label.A).replace(/\bY\b/g, swap ? label.A : label.B)
  };
}

/** 芯・読後感の一覧から、種類の数と最多の重なりを出す */
function xCountKinds_(list) {
  var c = {};
  (list || []).forEach(function (x) { x = String(x || '').trim(); if (x) c[x] = (c[x] || 0) + 1; });
  var keys = Object.keys(c);
  var max = keys.reduce(function (m, k) { return Math.max(m, c[k]); }, 0);
  return { kinds: keys.length, max: max, text: keys.map(function (k) { return k + c[k]; }).join('・'), count: c };
}

/** 今の方式の1本ぶんの企画（先に配ったもの＋企画会議の材料・主張） */
function xCompareOldPlanText_(d, i) {
  var a = d.assign || {};
  var p = d.plan && d.plan[i];
  return [
    '型: ' + ((a.pattern || [])[i] || 'なし'),
    '角度: ' + ((a.angle || [])[i] || ''),
    '役割: ' + ((a.role || [])[i] || ''),
    'カギカッコ: ' + (((a.quoteOk || [])[i]) ? '可' : '不可'),
    p ? ('材料: ' + ((p.materials || []).map(function (m) { return m.no; }).join('+') || ('題材: ' + (p.subject || ''))) +
      (p.claim ? '\n主張: ' + p.claim : '') + (p.plan ? '\n企画: ' + p.plan : '')) : '（企画会議なし）'
  ].join('\n');
}

/** 新しい方式の1本ぶんの企画 */
function xCompareNewPlanText_(d, i) {
  var p = d.plan && d.plan[i];
  if (!p || !p.newPlan) return '（企画会議が失敗し、今の方式で書いた）';
  return [
    '芯: ' + p.core,
    p.quote ? '芯になる一文: 「' + p.quote + '」' : '',
    '残るもの: ' + (p.takeaway || 'なし'),
    '読後感: ' + (p.feel || ''),
    '締め方: ' + (p.close || ''),
    '型: ' + (p.pattern || 'なし') + ' / 角度: ' + (p.angle || 'なし') + ' / 役割: ' + (p.role || ''),
    '材料: ' + ((p.materials || []).map(function (m) { return m.no; }).join('+') || ('題材: ' + (p.subject || ''))),
    p.plan ? '企画: ' + p.plan : '',
    p.claim ? '主張: ' + p.claim : '',
    (p.issues || []).length ? '注意: ' + p.issues.join('／') : ''
  ].filter(String).join('\n');
}

/** 比較結果をシートに書く */
function xWriteCompare_(ctx, d, judge) {
  var sh = xSheet_(X_COMPARE_SHEET, []);
  sh.clearContents();
  var W = 7;
  var pad = function (row) { while (row.length < W) row.push(''); return row; };
  var out = [];
  var A = d.A, B = d.B;
  var LA = A.side.label, LB = B.side.label;
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

  out.push(pad(['企画の方式の比較（' + now + '）']));
  out.push(pad(['同じ材料（今週の返信・今週あったこと・週の傾向）から、2つの方式で7本ずつ作り、両方とも週の編集まで通しました。文体の分離はどちらも同じです。']));
  out.push(pad([LA + '＝型・角度・役割を順に配る／' + LB + '＝企画会議が材料を見て、芯・締め方・型・角度・役割を選ぶ']));
  out.push(pad(['']));

  // 1. 企画
  out.push(pad(['■ 1. 7本の企画', '長さ・分類', LA, LB]));
  for (var i = 0; i < 7; i++) {
    var slot = ctx.plan[i];
    out.push(pad([(i + 1) + '本目', slot ? ((slot.len || '') + (slot.cat ? '・' + slot.cat : '')) : '',
      xCompareOldPlanText_(A, i), xCompareNewPlanText_(B, i)]));
  }
  out.push(pad(['', '', A.note || '', B.note || '']));
  out.push(pad(['']));

  // 2. 本文
  out.push(pad(['■ 2. 本文（週の編集のあと）', '', LA + ' 1行目', LB + ' 1行目', LA + ' 本文', LB + ' 本文', '編集メモ（今／新）']));
  for (var k = 0; k < 7; k++) {
    var pa = A.posts[k] || {}, pb = B.posts[k] || {};
    out.push(pad([(k + 1) + '本目', '', xFirstLine_(pa['本文']), xFirstLine_(pb['本文']),
      String(pa['本文'] || ''), String(pb['本文'] || ''), (pa._note || '') + '\n／\n' + (pb._note || '')]));
  }
  out.push(pad(['']));
  out.push(pad(['■ 締めの一文', '', LA, LB]));
  for (var t = 0; t < 7; t++) out.push(pad([(t + 1) + '本目', '', xLastLine_((A.posts[t] || {})['本文']), xLastLine_((B.posts[t] || {})['本文'])]));
  out.push(pad(['']));

  // 3. 採用しなかった材料
  out.push(pad(['■ 3. 採用しなかった材料', '', LA, LB]));
  var unusedText = function (u) {
    return (u || []).map(function (x) { return '[' + x.no + '] ' + x.reason + '\n  ' + String(x.text || '').slice(0, 50); }).join('\n') || '（なし）';
  };
  out.push(pad(['', '', unusedText(A.unused), unusedText(B.unused)]));
  out.push(pad(['']));

  // 4. 機械の目安
  out.push(pad(['■ 4. 機械で数えた目安', '', LA, LB, '見方']));
  Object.keys(B.metrics).forEach(function (key) { out.push(pad([key, '', A.metrics[key], B.metrics[key], X_COMPARE_HINTS[key] || ''])); });
  var ed = function (e) { return '作り直し ' + (e.replaced || 0) + '本' + ((e.shortage || []).length ? '・空き ' + e.shortage.length : '') + (e.skipped ? '（' + e.skipped + '）' : ''); };
  out.push(pad(['週の編集', '', ed(A.edit), ed(B.edit), '作り直しが多いほど、最初の企画が重なっていた']));
  out.push(pad(['']));

  // 5. AIの比較
  out.push(pad(['■ 5. AIによる比較（どちらが新しい方式かを伏せて評価）']));
  if (judge) {
    var cA = xCountKinds_(judge.core.A), cB = xCountKinds_(judge.core.B);
    var fA = xCountKinds_(judge.feel.A), fB = xCountKinds_(judge.feel.B);
    var star = function (list) { return (list || []).filter(function (x) { return x['評価'] === '◎'; }).length; };
    var funText = function (list) {
      return (list || []).filter(function (x) { return x['評価'] === '◎' || x['評価'] === '○'; })
        .map(function (x) { return x['本'] + '本目 ' + x['評価'] + '「' + String(x['止まる一文'] || '').slice(0, 40) + '」'; }).join('\n');
    };
    out.push(pad(['観点', '', LA, LB, 'AIの見立て']));
    out.push(pad(['実際に読んで面白いか（◎の本数）', '', star(judge.fun.A), star(judge.fun.B), '◎＝読んで止まる']));
    out.push(pad(['止まる一文', '', funText(judge.fun.A), funText(judge.fun.B)]));
    out.push(pad(['主張ばかりになっていないか（主張の本数）', '', cA.count['主張'] || 0, cB.count['主張'] || 0, '上限は設けていない。材料しだい']));
    out.push(pad(['芯の内訳（種類の数）', '', cA.text + '（' + cA.kinds + '種類）', cB.text + '（' + cB.kinds + '種類）', '3種類以上は努力目標']));
    out.push(pad(['読後感の重なり（同じ読後感の最多）', '', fA.text + '（最多' + fA.max + '）', fB.text + '（最多' + fB.max + '）', '目安は同じ読後感が週2本まで']));
    out.push(pad(['私らしい文体が保たれているか', '', '', '', 'より良い: ' + judge.style.better + '\n' + judge.style.why]));
    out.push(pad(['似た結論に寄る傾向', '', judge.conclusion.A, judge.conclusion.B, '少ない: ' + judge.conclusion.fewer]));
    out.push(pad(['根拠のない断定', '', judge.overclaim.A.length + '箇所\n' + xFormatClaims_(judge.overclaim.A), judge.overclaim.B.length + '箇所\n' + xFormatClaims_(judge.overclaim.B)]));
    out.push(pad(['冒頭や締めの変化', '', '', '', '変化が大きい: ' + judge.openClose.more + '\n' + judge.openClose.why]));
    out.push(pad(['編集の負担（直す箇所の合計）', '', judge.edits.A, judge.edits.B, judge.edits.why]));
    out.push(pad(['総評', '', '', '', judge.summary]));
  } else {
    out.push(pad(['（AIによる比較に失敗しました。もう一度押すとやり直せます）']));
  }
  out.push(pad(['']));

  // 6. 本人の判定
  out.push(pad(['■ 6. あなたの判定（ここに書き込んでください）', '', LA, LB, 'メモ']));
  ['実際に読んで面白いと思えた本の数', '私らしい文体が保たれているか', '似た結論に寄る傾向が減ったか', '根拠のない断定が増えていないか',
   '冒頭や締めに変化が出たか', '私が編集する負担が増えていないか'].forEach(function (key) { out.push(pad([key, '', '', '', ''])); });

  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(3, 320);
  sh.setColumnWidth(4, 320);
  sh.setColumnWidth(5, 380);
  sh.setColumnWidth(6, 380);
  sh.setColumnWidth(7, 260);
  sh.getRange(1, 1, out.length, W).setWrap(true).setVerticalAlignment('top');
}

/** 根拠のない断定の一覧を1セルに */
function xFormatClaims_(list) {
  return (list || []).map(function (c) {
    return (c['本'] ? c['本'] + '本目 ' : '') + '「' + String(c['箇所'] || '').slice(0, 50) + '」（' + (c['種類'] || '') + '）';
  }).join('\n');
}

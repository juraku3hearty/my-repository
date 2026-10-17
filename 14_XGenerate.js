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
function xGenCtx_(themesText, count, modeOverride, planOverride) {
  var started = Date.now();

  var setting = xReadSetting_();
  // 改修後：文体ルールを区分ごとに分けて渡す／改修前：以前どおり全部を「文体ルール」として渡す
  var mode = xGenMode_(setting, modeOverride);
  // 材料に合わせる：企画会議が芯・締め方・型・角度・役割を選ぶ／先行割り当て：以前どおり順に配る
  var planMode = xPlanMode_(setting, planOverride);
  var strategy = xReadStrategy_();
  var concept = setting['これからのコンセプト'] || '';
  if (!strategy && !concept) {
    throw new Error('発信の軸がありません。X_設定の「戦略シート名」にヒアリング・戦略シートの名前を入れるか、' +
      '「これからのコンセプト」を書いてください。');
  }

  var rules = mode === X_GEN_MODE.NEW ? xReadRuleParts_() : xReadRules_();

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

  var system = xGenSystem_(mode, planMode);
  // 材料に合わせる方式では、型カタログ全文を毎回は渡さない（企画会議が選んだ型だけを渡す）
  var context = xGenContext_(setting, strategy, concept, rules,
                             facts, factSheets, sampleSheets,
                             planMode === X_PLAN_MODE.NEW ? '' : patterns,
                             reactions, adopted, replies, notes, planSheets, trend, mode, planMode);

  return {
    mode: mode,
    planMode: planMode,
    patternsText: patterns,
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
  // 書く前に1週間ぶんの企画を決める（同じ主張・同じ材料を2本にしないため）
  if (ctx.weekPlan === undefined) {
    ctx.weekPlan = xPlanWeek_(ctx);
    if (ctx.planMode === X_PLAN_MODE.NEW && ctx.weekPlan) {
      try { xWritePlanSheet_(ctx, ctx.weekPlan); } catch (e) { Logger.log('企画会議の記録に失敗: ' + e.message); }
    }
  }

  var g = xGenJobs_(ctx);
  var got = xGenCollect_(ctx, g.jobs, xClaudeBatch_(g.reqs));

  // 落ちた分だけ、1本ずつ・これも並列で作り直す
  if (got.failed.length && Date.now() - ctx.started < X_GEN_TIME_LIMIT_MS) {
    xGenCollectRetry_(ctx, got.failed, xClaudeBatch_(xGenRetryReqs_(ctx, got.failed)), got.all);
  }
  return xGenFinish_(ctx, got.all);
}

/**
 * 最初の生成の依頼を作る（2本ずつの束）。
 * 改修前後の比較で、2つの方式の依頼をまとめて並列に投げられるように分けてある。
 * @return {Object} { jobs:[{from,n}], reqs:[依頼] }
 */
function xGenJobs_(ctx) {
  xGenMarkPlan_(ctx);
  var jobs = [];
  for (var from = 0; from < ctx.count; from += X_GEN_CHUNK) {
    jobs.push({ from: from, n: Math.min(X_GEN_CHUNK, ctx.count - from) });
  }
  var reqs = jobs.map(function (j) {
    return {
      system: ctx.system,
      userText: ctx.context + xGenFallbackPatterns_(ctx) + '\n' +
        xGenRequest_(j.from, j.n, ctx.count, ctx.themes, ctx.plan, ctx.spec, ctx.pastThemes) +
        xPlanText_(ctx.weekPlan, j.from, j.n),
      maxTokens: X_GEN_MAX_TOKENS,
      effort: 'high'
    };
  });
  return { jobs: jobs, reqs: reqs };
}

/** 企画会議（材料に合わせる方式）の結果があるかを spec に印す */
function xGenMarkPlan_(ctx) {
  ctx.spec.planNew = !!(ctx.planMode === X_PLAN_MODE.NEW && ctx.weekPlan && ctx.weekPlan[0] && ctx.weekPlan[0].newPlan);
}

/**
 * 材料に合わせる方式なのに企画会議が失敗したとき（以前の方式で書く）は、
 * 文脈から外しておいた型カタログを添える。
 */
function xGenFallbackPatterns_(ctx) {
  if (ctx.planMode !== X_PLAN_MODE.NEW || ctx.spec.planNew || !ctx.patternsText) return '';
  return '\n# ① 外部ライターの企画（テーマ選びと切り口の参考）\n## 構成の型（骨組みだけ）\n' + ctx.patternsText + '\n';
}

/** 企画会議で決めた芯と読後感を、投稿に写す（シートで見られるように） */
function xGenCopyPlan_(ctx, p) {
  var wp = ctx.weekPlan && ctx.weekPlan[p._idx];
  if (!wp || !wp.newPlan) return;
  p['芯'] = wp.core;
  p['読後感'] = wp.feel;
  if (!p['役割'] && wp.role) p['役割'] = wp.role;
}

/**
 * 束ごとの応答から投稿を取り出す。
 * @return {Object} { all:[投稿], failed:[作り直す枠] }
 */
function xGenCollect_(ctx, jobs, results) {
  var weekPlan = ctx.weekPlan;
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
      xGenCopyPlan_(ctx, p);
    });
    all = all.concat(got);

    // 足りない分（束ごと落ちた・途中で切れた）は、1本ずつやり直す。
    // 切れた場合に残るのは前のほうなので、欠けているのは後ろの番号。
    for (var k = got.length; k < jobs[i].n; k++) failed.push(jobs[i].from + k);
  }
  return { all: all, failed: failed };
}

/** 落ちた枠を1本ずつ作り直す依頼 */
function xGenRetryReqs_(ctx, failed) {
  return failed.map(function (idx) {
    return {
      system: ctx.system,
      userText: ctx.context + xGenFallbackPatterns_(ctx) + '\n' +
        xGenRequest_(idx, 1, ctx.count, ctx.themes, ctx.plan, ctx.spec, ctx.pastThemes) +
        xPlanText_(ctx.weekPlan, idx, 1),
      maxTokens: X_GEN_MAX_TOKENS,
      effort: 'high'
    };
  });
}

/** 作り直しの応答を all に足す */
function xGenCollectRetry_(ctx, failed, retry, all) {
  for (var r = 0; r < retry.length; r++) {
    if (!retry[r] || !retry[r].ok) {
      Logger.log((failed[r] + 1) + '本目を飛ばしました: ' +
        ((retry[r] && retry[r].error) || '不明'));
      continue;
    }
    var one = xParsePosts_(retry[r].text).slice(0, 1);
    if (one.length) { one[0]._idx = failed[r]; xGenCopyPlan_(ctx, one[0]); all.push(one[0]); }
    else Logger.log((failed[r] + 1) + '本目を飛ばしました（読み取り不能）: ' +
      String(retry[r].text).slice(0, 200));
  }
}

/** 枠の順に並べ直して返す */
function xGenFinish_(ctx, all) {
  // やり直した分が後ろに付くので、割り当てた番号順（＝曜日順）に戻す
  all.sort(function (x, y) { return x._idx - y._idx; });
  Logger.log('生成 ' + all.length + '/' + ctx.count + '本 … ' +
    Math.round((Date.now() - ctx.started) / 1000) + '秒');
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
function xGenSystem_(mode, planMode) {
  var assertRules = mode === X_GEN_MODE.NEW ? xAssertRulesNew_() : xAssertRulesOld_();
  var noExample = planMode === X_PLAN_MODE.NEW
    ? ['  実例が無い場合は、企画の芯（主張・問い・観察）に沿って、確認済みのことだけで書いてください。',
       '  方針の表明（〜したい・〜と思っています）で締めるのは、題材が「これからやりたい仕事」の本だけにしてください。']
    : ['  実例が無い場合は、この書き手が今後大切にしたい考え方・仕事の方針として書いてください。'];
  return [
    'あなたは、ある書き手の文体を完全に再現して X の投稿を書く人です。',
    ''
  ].concat(assertRules).concat([
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
  ]).concat(noExample).concat([
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
  ]).join('\n');
}

/** 言い切りの規則（改修前の文面。変えない） */
function xAssertRulesOld_() {
  return [
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
    ''
  ];
}

/**
 * 言い切りの基準（改修後）。
 *
 * 本人：「強い文章そのものが嫌なのではなく、根拠がないことを言い切るのが苦手」。
 * 改修前は「言い切ってよいのは経験だけ」「元の発言より強く言い切らない」だったため、
 * 本人が自分で考えてきたこと・自分の方針まで、留保つきの弱い書き方になっていた。
 * 根拠の有無で分ける。
 */
function xAssertRulesNew_() {
  return [
    '■ 言い切りの基準（この書き手の核になる規則）',
    '',
    'この書き手は、強い文章が嫌なのではありません。根拠がないことを言い切るのが苦手です。',
    '根拠があることははっきり書き、根拠がないことは断定しないでください。',
    '',
    'はっきり書いてよいもの',
    '  ・確認済みの経験や実績（材料に書かれていること）',
    '  ・この書き手が自分で考えてきたこと、自分の方針',
    '    「私はこう考えている」「私はこうする」と、留保をつけずに書いてください。そこがこの書き手の強みです。',
    '  例：「早いのは、今日だけ」「あの冷や汗が怖くて、結局自分で見るしかなかった」',
    '',
    '断定しないもの（留保をつける：「〜な気がします」「たぶん」「〜かもしれません」）',
    '  ・他人の気持ち（「社長は〜と思っている」「スタッフは〜が不安」など）',
    '  ・一般論・傾向・統計（「9割が」「ほぼ全員」「絶対に」「本質は」「決め手はこれだけ」は使いません）',
    '  ・未確認の成果（「これでうまくいく」「売上が上がる」など）',
    '',
    '付け加えないもの',
    '  ・本人が言っていない因果関係（「だから成功する」など）',
    '  ・本人が言っていない成果',
    '',
    '元になった発言（返信など）がある場合',
    '  ・その発言に無い因果関係や成果を足さないでください。',
    '  ・発言の中の留保が、他人の気持ち・一般論・未確認の成果についてのものなら、そのまま残してください。',
    '  ・本人の考えを控えめに言っているだけの留保（「〜だったりします」など）は、本人の考えとしてはっきり書いて構いません。',
    ''
  ];
}

/** 毎回共通で渡す材料 */
function xGenContext_(setting, strategy, concept, rules, facts,
                      factSheets, sampleSheets, patterns, reactions, adopted,
                      replies, notes, planSheets, trend, mode, planMode) {
  var parts = [];
  var isNew = mode === X_GEN_MODE.NEW;
  var planNew = planMode === X_PLAN_MODE.NEW;

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

  if (rules && typeof rules === 'object') {
    // 改修後：文体（書き方）・軸・過去の主張を分けて渡す
    parts.push('# 文体ルール（書き方。必ず守る）');
    parts.push('語尾・改行・言葉遣い・禁止表現など、過去の書き換え履歴から取り出した書き方です。');
    parts.push(rules.style);
    parts.push('');
    if (rules.axis) {
      parts.push('# 発信の軸・価値観（この書き手が大切にしている考え方）');
      parts.push('企画の方向性を判断するときに使ってください。');
      parts.push('軸に沿っていれば十分です。毎回この言葉や結論に着地させる必要はありません。');
      parts.push(rules.axis);
      parts.push('');
    }
    if (rules.past) {
      parts.push('# これまでに言ってきた主張・書いてきたテーマ（焼き直し防止）');
      parts.push('ここは書き方ではなく、過去に書いた中身です。');
      parts.push('同じ結論に着地しないでください。同じ主張を言い直さないでください。');
      parts.push('テーマが重なるのは構いませんが、違う結論・違う角度にしてください。');
      parts.push(rules.past);
      parts.push('');
    }
  } else {
    parts.push('# 文体ルール（過去の書き換え履歴から抽出）');
    parts.push(rules);
    parts.push('');
  }

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
    if (isNew) {
      parts.push('・本人の発言に無い因果関係や成果を足さないでください。');
      parts.push('  他人の気持ち・一般論・未確認の成果についての留保はそのまま残し、本人の考えははっきり書いて構いません。');
    } else {
      parts.push('・本人の発言を、元の意味より強く断定しないでください。');
      parts.push('  「〜だったりします」「〜かもしれません」は、そのまま残してください。');
    }
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
    if (planNew) {
      parts.push('芯が主張・問いの本は、読み終えたときに、読者が前と違うことを考えている状態にしてください。');
      parts.push('場面・感情・観察の本は、教訓や問いかけを足さず、そのままで構いません。');
    } else {
      parts.push('読み終えたときに、読者が前と違うことを考えている状態にしてください。');
    }
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
    if (isNew) {
      parts.push('**その返信に無い因果関係や成果を足さないでください。**');
      parts.push('本人の考えははっきり書いて構いませんが、他人の気持ち・一般論・未確認の成果は断定しないでください。');
    } else {
      parts.push('**その返信より強く言い切らないでください。**');
      parts.push('「〜だったりします」を「〜する」に変えない。根拠のない因果を足さない。');
    }
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
  // 材料に合わせる方式で企画会議の結果があるときは、型・角度・役割・冒頭を先に配らない
  var planNew = !!(spec && spec.planNew);
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

  if (!planNew && spec.role && spec.role.length) {
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
  if (!planNew) {
    parts.push('## 視点の角度（1本ずつ違う角度から書く）');
    parts.push('素材が同じでも、どの向きから見るかで結論が変わります。');
    parts.push('文体をなぞるだけだと、過去に書いたことの焼き直しになります。');
    for (var a = 0; a < n; a++) {
      var ai = (from + a) % X_ANGLES.length;
      parts.push('・' + (from + a + 1) + '本目の角度: ' + X_ANGLES[ai]);
    }
    parts.push('');
  }

  if (pastThemes && pastThemes.length) {
    parts.push('## すでに書いたテーマ（同じ結論に着地しない）');
    parts.push('同じテーマを扱っても構いませんが、下と同じ着地にはしないでください。');
    parts.push('「結局いちばん大事なのは◯◯でした」で終わる形が繰り返されています。');
    parts.push(planNew
      ? '芯が主張・問いの本は、読み終えたときに、読者が前と違うことを考えている状態にしてください。'
      : '読み終えたときに、読者が前と違うことを考えている状態にしてください。');
    pastThemes.slice(0, 30).forEach(function (t) { parts.push('  ・' + t); });
    parts.push('');
  }

  // 型と冒頭は、全本ぶんを先に割り振ってある（並列に作るので後から避けられない）
  if (!planNew) {
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
  }

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
  parts.push(planNew ? '  "使った型": "企画で型を選んだときだけその型名。無ければ「なし」",' : '  "使った型": "構成の型の型名",');
  parts.push('  "分類": "拡散／共感／人脈／助け／成果／専門／自分の言葉／仕組み化 のどれか",');
  parts.push(planNew ? '  "役割": "企画の役割",' : '  "役割": "割り当てた役割。材料が無くて変えた場合は「〇〇→△△（理由）」",');
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
      '芯': p['芯'] || '',
      '読後感': p['読後感'] || '',
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

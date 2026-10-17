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
    system: xEditSystem_(ctx.mode),
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
function xEditSystem_(mode) {
  // 改修後は、言い過ぎの対象に「他人の気持ち・一般論の断定」「本人が言っていない因果・成果」を足す
  var extraOverclaim = mode === X_GEN_MODE.NEW ? [
    '・他人の気持ち・一般論・未確認の成果を断定している箇所',
    '・本人が言っていない因果関係や成果を付け加えている箇所',
    '（本人の経験・本人が考えてきたこと・本人の方針をはっきり書いているのは、言い過ぎではありません）'
  ] : [];
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
  ].concat(extraOverclaim).concat([
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
    mode === X_GEN_MODE.NEW
      ? '・企画は30字以内。主張は1文で、元の返信に無い因果関係や成果を足さないでください（本人の考えははっきり書いてよい）。'
      : '・企画は30字以内。主張は1文で、元の返信より強く言い切らないでください。',
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
  ]).join('\n');
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
    system: xEditSystem_(ctx.mode).split('■ 外した枠の作り直し')[0] + '出力はJSONのみ。',
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

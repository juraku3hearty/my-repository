/**
 * 27_XPlanCore.js
 * 企画会議（材料に合わせる方式）
 *
 * 以前の方式は、型・角度・役割を「何本目か」の順に先に配っていた。
 * 材料を見ずに配るので、材料と合わない形に押し込まれ、
 * 日常や人柄の投稿まで教訓や問いかけで締めることになっていた。
 *
 * この方式では、企画会議が材料を見てから、1本ずつ次を決める。
 *   芯（主張・場面・問い・感情・観察）／芯になる一文／読者に残るもの／読後感／締め方
 *   型・角度（必要なときだけ。「なし」可）／役割（一覧から）
 *
 * 目指すのは「形式的に違う7本」ではなく「実際に読んで面白いと思える7本」。
 * 数をそろえることより、材料の面白さと本人らしさを優先する。
 *
 * 守ること
 *   ・場面・感情は、材料にその場面や気持ちが書かれているときだけ（創作しない）
 *   ・芯の種類を3種類以上に散らすのは努力目標。足りないときに場面や感情を作らない
 *   ・主張の本の数に上限は無い（材料しだい）
 */

/** 企画会議の依頼（材料に合わせる方式） */
function xPlanRequestNew_(ctx) {
  return {
    system: xPlanSystemNew_(ctx.count, ctx.mode),
    userText: ctx.context + '\n' + xPlanMaterialText_(ctx),
    maxTokens: 20000,
    effort: 'high'
  };
}

/** 企画会議に渡す材料・枠・選べるもの */
function xPlanMaterialText_(ctx) {
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

  lines.push('# 枠（' + count + '本。長さと分類は本人が決めたもの）');
  for (var i = 0; i < count; i++) {
    var slot = ctx.plan[i];
    var line = '・' + (i + 1) + '本目';
    if (slot) {
      line += '（' + slot.date + '）: ' + (slot.len || '長文');
      if (slot.cat) line += ' / 分類=' + slot.cat;
      if (slot.memo) line += ' / メモ=' + slot.memo;
    } else {
      line += ': ' + xLayerPlan_(count)[i];
    }
    lines.push(line);
  }
  lines.push('');

  lines.push('# 選べるもの（必要なときだけ。合わなければ「なし」）');
  lines.push('## 型カタログ');
  var pats = [];
  try { pats = xReadPatterns_(); } catch (e) { pats = []; }
  lines.push(pats.length ? pats.map(function (p) {
    return '・' + p.name + '：' + String(p.frame).replace(/\n/g, ' ') + '（向く分類: ' + p.cats + '）';
  }).join('\n') : '（なし）');
  lines.push('## 角度');
  lines.push(X_ANGLES.map(function (a, k) { return '・' + (k + 1) + '. ' + a; }).join('\n'));
  lines.push('## 役割');
  var roles = xSettingLines_(ctx.setting || {}, '週の役割配分', X_DEFAULT_ROLES)
    .map(function (l) { return l.replace(/\s*[:：]\s*[0-9０-９]+\s*本?$/, '').trim(); });
  lines.push(roles.map(function (r) { return '・' + r; }).join('\n'));
  lines.push('');

  if (ctx.pastThemes && ctx.pastThemes.length) {
    lines.push('# すでに書いたテーマ（同じ結論に戻らない）');
    ctx.pastThemes.slice(0, 20).forEach(function (t) { lines.push('  ・' + t); });
    lines.push('');
  }

  return lines.join('\n');
}

/** 企画会議の指示（材料に合わせる方式） */
function xPlanSystemNew_(count, mode) {
  var claimRule = mode === X_GEN_MODE.NEW
    ? '・主張は、元の返信に無い因果関係や成果を足さない（本人の考えははっきり書いてよい）。'
    : '・主張は、元の返信より強く言い切らない。';
  return [
    'あなたは、ある書き手のXアカウントの編集者です。',
    'これから' + count + '本の投稿を書く前に、1週間ぶんの企画を決めます。文章はまだ書きません。',
    '目指すのは「形式的に違う' + count + '本」ではなく、「実際に読んで面白いと思える' + count + '本」です。',
    '数をそろえることより、材料の面白さと、この書き手らしさを優先してください。',
    '',
    '■ 1本ごとに決めること',
    '・材料：返信・引用（R番号）、今週あったこと（M番号）。同じ材料は1本だけ。',
    '  同じ出来事について書いた返信が複数あれば、1本の材料にまとめる。',
    '・芯：次から1つ',
    X_CORE_TYPES.map(function (c) { return '    ' + c.name + '…' + c.desc; }).join('\n'),
    '・芯になる一文：材料の中から、この本の引っかかりになる本人の言葉や具体を1つ、そのまま抜き出す（材料が無い枠は空）',
    '・読者に残るもの：気づきを1文。場面・感情・観察の本は「なし」でよい',
    '・読後感：一語（例：くすっと／しみじみ／ひやっと／背筋が伸びる／もやっと／ほっとする）',
    '・締め方：芯に合わせる（' + X_CORE_TYPES.map(function (c) { return c.name + '→' + c.close.split('。')[0]; }).join('／') + '）',
    '・型：型カタログから、材料に合うものがあれば1つ。合わなければ「なし」',
    '・角度：角度の一覧から、合うものがあれば番号を1つ。合わなければ「なし」',
    '・役割：役割の一覧から、材料に合うものを1つ',
    '・冒頭カギカッコ：カギカッコで誰かの言葉から始めるか。材料にその言葉があるときだけ true',
    '・企画：30字以内',
    '・主張：芯が主張の本だけ1文。ほかは空でよい',
    '',
    '■ 1週間で重ならないようにすること',
    '・同じ主張・同じ気づき（読者に残るもの）は週1本。言い方が違っても、言っていることが同じなら同じとみなす。',
    '  （例：「社長の当たり前の判断を言葉にする」と「判断基準を現場に渡す」は同じ気づき）',
    '・同じ読後感は週' + X_WEEK_LIMITS.feel + '本まで。',
    '・問いで締める本は週' + X_WEEK_LIMITS.question + '本まで。',
    '・自己表明（〜したい／〜と思っています）で締める本は週' + X_WEEK_LIMITS.selfStatement + '本まで。',
    '・カギカッコ始まりは週' + X_WEEK_LIMITS.quote + '本まで。',
    '・芯の種類は、材料が許すなら3種類以上に散らしてください（努力目標）。',
    '  種類を増やすために、場面・感情・エピソードを作らないでください。',
    '・主張の本の数に上限はありません。材料が主張に向いているなら主張で構いません。',
    '・日常・人柄の本、場面・感情・観察の本は、教訓や問いかけで締める必要はありません。',
    '・業務改善・仕組み化の話は週' + X_SYSTEM_TOPIC_MAX + '本まで。',
    '',
    '■ 材料の扱い',
    '・事業の方向性シートは軸の確認だけに使います。そこからテーマを作らないでください。',
    '・発信の軸・価値観は企画の方向性の判断に使います。毎回そこに着地させないでください。',
    '・「これまでに言ってきた主張」と同じ結論に着地する企画にしないでください。',
    '・材料が足りない枠は、材料を空にして "題材" を1つ決めてください（' + X_SUBJECTS.join('・') + '）。',
    '  その枠の芯は、主張・問い・観察から選んでください（場面・感情は選ばない）。',
    '・方針の表明（〜したい）を芯にするのは、題材が「これからやりたい仕事」の本だけです。',
    '・実績、相談者・お客様の発言、確認できない数字を前提にしないでください。',
    claimRule,
    '',
    '■ 採用しなかった材料',
    '・候補の材料のうち、どの本にも使わなかったものは、番号と理由（20字以内）を "使わなかった材料" に入れてください。',
    '',
    '■ 出力（JSONのみ。説明やコードフェンスは付けない）',
    '{"枠": [',
    '  {"本": 1, "材料": ["R2", "R3"], "題材": "", "芯": "場面", "芯になる一文": "材料からそのまま",',
    '   "読者に残るもの": "なし", "読後感": "しみじみ", "締め方": "場面で止める", "型": "なし", "角度": "なし",',
    '   "役割": "人柄や日常の気づき", "冒頭カギカッコ": false, "企画": "30字以内", "主張": ""}',
    '],',
    ' "使わなかった材料": [{"材料": "R5", "理由": "R1と同じ論点"}]}',
    '本の番号は 1 から ' + count + ' まで、すべての枠を入れてください。'
  ].join('\n');
}

/**
 * 企画会議の応答を読む（材料に合わせる方式）。失敗したら null。
 * 数えられる基準はプログラムで確かめ、超えていればその枠だけ企画をやり直させる（1回まで）。
 */
function xPlanParseNew_(ctx, res) {
  if (!res || !res.ok) {
    Logger.log('週の企画に失敗（以前の方式で書きます）: ' + ((res && res.error) || '不明'));
    return null;
  }
  var json;
  try { json = xParseJson_(res.text); } catch (e) {
    Logger.log('週の企画の返答を読めませんでした（以前の方式で書きます）: ' + e.message);
    return null;
  }

  var plan = xPlanFromJson_(ctx, json, null);
  if (!plan) {
    Logger.log('週の企画が空でした（以前の方式で書きます）');
    return null;
  }

  // 数えられる基準を確かめ、超えた枠だけやり直す（時間があれば1回）
  var v = xPlanCheck_(ctx, plan);
  if (v.length && Date.now() - ctx.started < X_PLAN_FIX_LIMIT_MS) {
    var fixed = xPlanFix_(ctx, plan, v, json);
    if (fixed) {
      plan = fixed;
      v = xPlanCheck_(ctx, plan);
    }
  }
  plan.forEach(function (p) { p.issues = []; });
  v.forEach(function (x) { if (plan[x.idx]) plan[x.idx].issues.push(x.reason); });

  xPlanFinishUnused_(ctx, plan);
  Logger.log('週の企画（材料に合わせる）: ' + plan.map(function (p, i) {
    return (i + 1) + '本目=' + p.core + '/' + (p.materials.length ? p.materials.map(function (m) { return m.no; }).join('+') : '題材:' + p.subject) +
      '/' + (p.feel || '');
  }).join(' / ') + (v.length ? '（残った注意 ' + v.length + '件）' : ''));
  return plan;
}

/** 企画のやり直しを始めてよい経過時間 */
var X_PLAN_FIX_LIMIT_MS = 1.8 * 60 * 1000;

/**
 * JSON を枠ごとの企画にする。
 * @param {Object} base やり直しのとき、元の企画（やり直さない枠はこれを残す）
 */
function xPlanFromJson_(ctx, json, base) {
  var replies = ctx.replyList || [];
  var notes = ctx.noteList || [];
  var count = ctx.count;
  var find = function (key) {
    var k = String(key || '').trim();
    var m = k.match(/^([RM])\s*(\d+)$/i);
    if (!m) return null;
    var list = m[1].toUpperCase() === 'R' ? replies : notes;
    return list.filter(function (x) { return x.no === m[1].toUpperCase() + m[2]; })[0] || null;
  };
  var pats = [];
  try { pats = xReadPatterns_(); } catch (e) { pats = []; }
  var patNames = pats.map(function (p) { return p.name; });
  var cores = X_CORE_TYPES.map(function (c) { return c.name; });

  var out = [];
  for (var j = 0; j < count; j++) out.push(base ? base[j] : null);
  var dropped = [];

  // やり直しのときは、やり直さない枠の材料を「使用済み」にしておく
  var usedMaterial = {};
  var redo = {};
  (json['枠'] || []).forEach(function (f) { var i = parseInt(f['本'], 10) - 1; if (i >= 0) redo[i] = true; });
  if (base) out.forEach(function (p, i) { if (p && !redo[i]) p.materials.forEach(function (m) { usedMaterial[m.no] = true; }); });

  (json['枠'] || []).forEach(function (f) {
    var idx = parseInt(f['本'], 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= count) return;
    if (!base && out[idx]) return;
    var mats = [];
    (f['材料'] || []).forEach(function (k) {
      var m = find(k);
      if (!m) return;
      if (usedMaterial[m.no]) { dropped.push({ no: m.no, reason: '別の枠と重なったため外した' }); return; }
      usedMaterial[m.no] = true;
      mats.push(m);
    });
    var core = String(f['芯'] || '').trim();
    if (cores.indexOf(core) < 0) core = mats.length ? '主張' : '観察';
    var pat = String(f['型'] || '').trim();
    var ang = parseInt(String(f['角度'] || '').replace(/[^0-9]/g, ''), 10);
    out[idx] = {
      newPlan: true,
      materials: mats,
      subject: xNormSubject_(f['題材']),
      core: core,
      quote: String(f['芯になる一文'] || '').trim(),
      takeaway: String(f['読者に残るもの'] || '').trim(),
      feel: String(f['読後感'] || '').trim(),
      close: String(f['締め方'] || '').trim(),
      pattern: patNames.indexOf(pat) >= 0 ? pat : '',
      angle: (ang >= 1 && ang <= X_ANGLES.length) ? ang : 0,
      role: String(f['役割'] || '').trim(),
      quoteStart: f['冒頭カギカッコ'] === true || String(f['冒頭カギカッコ']).toLowerCase() === 'true',
      plan: String(f['企画'] || ''),
      claim: String(f['主張'] || '')
    };
  });

  if (!out.some(Boolean)) return null;

  // 企画が無い枠は、題材だけ決めて観察で埋める
  var pseudo = [];
  out.forEach(function (p, i) {
    if (!p) out[i] = p = { newPlan: true, materials: [], subject: '', core: '観察', quote: '', takeaway: '', feel: '', close: '', pattern: '', angle: 0, role: '', quoteStart: false, plan: '', claim: '' };
    if (!p.materials.length && !p.subject) pseudo.push({ idx: i, material: null, subject: '' });
  });
  if (pseudo.length) {
    var usedPosts = out.map(function (p, i) { return { _idx: i, '題材': p.subject }; }).filter(function (p) { return p['題材']; });
    xAssignSubjects_(pseudo, usedPosts);
    pseudo.forEach(function (r) { out[r.idx].subject = r.subject; });
  }

  out.unusedFromModel = (json['使わなかった材料'] || []).map(function (u) {
    return { no: String(u['材料'] || '').trim(), reason: String(u['理由'] || '').trim() };
  }).filter(function (u) { return u.no; });
  out.droppedByCode = dropped;
  return out;
}

/**
 * 数えられる基準を確かめる。超えた枠を返す（後ろの枠から外す）。
 * カギカッコ始まりの超過は、やり直さずにプログラムで外す。
 * @return {Array<Object>} [{idx, reason}]
 */
function xPlanCheck_(ctx, plan) {
  var v = [];
  var add = function (i, r) { v.push({ idx: i, reason: r }); };

  // 材料に無い場面・感情
  plan.forEach(function (p, i) {
    if ((p.core === '場面' || p.core === '感情') && !p.materials.length) {
      add(i, '材料が無いのに芯が' + p.core + '（場面・感情は材料にあるときだけ）');
    } else if ((p.core === '場面' || p.core === '感情') && !xQuoteInMaterial_(p.quote, p.materials)) {
      add(i, '芯になる一文が材料に見当たらない（' + p.core + 'は材料にある場面・気持ちだけ）');
    }
  });

  // 同じ気づき・同じ主張
  var said = [];
  plan.forEach(function (p, i) {
    var t = [p.takeaway, p.claim].filter(function (x) { return x && x !== 'なし'; }).join(' ');
    if (!t) return;
    for (var k = 0; k < said.length; k++) {
      if (xBigramSim_(t, said[k].t) >= 0.45) { add(i, (said[k].i + 1) + '本目と同じ気づき・主張'); return; }
    }
    said.push({ i: i, t: t });
  });

  // 週の上限
  var countUp = function (test, limit, label) {
    var n = 0;
    plan.forEach(function (p, i) { if (test(p) && ++n > limit) add(i, label + 'が週' + limit + '本を超えた'); });
  };
  var feels = {};
  plan.forEach(function (p, i) {
    var f = String(p.feel || '').trim();
    if (!f) return;
    feels[f] = (feels[f] || 0) + 1;
    if (feels[f] > X_WEEK_LIMITS.feel) add(i, '読後感「' + f + '」が週' + X_WEEK_LIMITS.feel + '本を超えた');
  });
  countUp(function (p) { return p.core === '問い' || /問い/.test(p.close); }, X_WEEK_LIMITS.question, '問いで締める本');
  countUp(function (p) { return /自己表明|したい|思って|方針/.test(p.close); }, X_WEEK_LIMITS.selfStatement, '自己表明で締める本');

  // カギカッコ始まり：材料の無い枠は外し、超えた分も外す（やり直さない）
  var q = 0;
  plan.forEach(function (p) {
    if (p.quoteStart && (!p.materials.length || ++q > X_WEEK_LIMITS.quote)) p.quoteStart = false;
  });

  // 同じ枠の重複は1つにする
  var seen = {};
  return v.filter(function (x) { var k = x.idx + ':' + x.reason; if (seen[k]) return false; seen[k] = true; return true; });
}

/** 芯になる一文が、材料の中にあるか（言い回しの小さな違いは許す） */
function xQuoteInMaterial_(quote, mats) {
  var norm = function (t) { return String(t || '').replace(/[\s、。！？!?「」『』（）()・…〜~ー\-]/g, ''); };
  var q = norm(quote);
  if (q.length < 4) return false;
  var src = norm((mats || []).map(function (m) { return m.text; }).join(''));
  if (src.indexOf(q) >= 0) return true;
  var hit = 0, total = 0;
  for (var i = 0; i < q.length - 1; i++) { total++; if (src.indexOf(q.substr(i, 2)) >= 0) hit++; }
  return total > 0 && hit / total >= 0.8;
}

/** 基準を超えた枠だけ、企画をやり直させる（1回） */
function xPlanFix_(ctx, plan, violations, firstJson) {
  var idxs = [];
  violations.forEach(function (x) { if (idxs.indexOf(x.idx) < 0) idxs.push(x.idx); });

  var lines = [];
  lines.push('# いまの企画');
  plan.forEach(function (p, i) {
    lines.push('・' + (i + 1) + '本目: 芯=' + p.core + ' / 材料=' + (p.materials.map(function (m) { return m.no; }).join('+') || 'なし（題材:' + p.subject + '）') +
      ' / 読者に残るもの=' + (p.takeaway || 'なし') + ' / 読後感=' + p.feel + ' / 締め方=' + p.close + ' / 企画=' + p.plan);
  });
  lines.push('');
  lines.push('# 基準に合わなかったところ');
  violations.forEach(function (x) { lines.push('・' + (x.idx + 1) + '本目: ' + x.reason); });
  lines.push('');
  lines.push('# 依頼');
  lines.push('次の枠だけ、企画をやり直してください: ' + idxs.map(function (i) { return (i + 1) + '本目'; }).join('・'));
  lines.push('ほかの枠は変えません。ほかの枠が使っている材料は使わないでください。');
  lines.push('材料が足りずに直せない場合は、芯を主張・問い・観察にして材料を空にし、題材を決めてください。場面や感情を作らないでください。');
  lines.push('出力の形は同じです（"枠" にはやり直した枠だけを入れる）。');

  var r = xClaudeBatch_([{
    system: xPlanSystemNew_(ctx.count, ctx.mode),
    userText: ctx.context + '\n' + xPlanMaterialText_(ctx) + '\n' + lines.join('\n'),
    maxTokens: 12000,
    effort: 'medium'
  }])[0];
  if (!r || !r.ok) return null;
  var json;
  try { json = xParseJson_(r.text); } catch (e) { return null; }

  // やり直しを頼んだ枠だけ差し替える
  json['枠'] = (json['枠'] || []).filter(function (f) { return idxs.indexOf(parseInt(f['本'], 10) - 1) >= 0; });
  if (!json['枠'].length) return null;
  var merged = xPlanFromJson_(ctx, json, plan);
  if (!merged) return null;
  merged.unusedFromModel = (plan.unusedFromModel || []).concat(merged.unusedFromModel || []);
  merged.droppedByCode = (plan.droppedByCode || []).concat(merged.droppedByCode || []);
  Logger.log('企画のやり直し: ' + idxs.map(function (i) { return (i + 1) + '本目'; }).join('・'));
  return merged;
}

/**
 * 採用しなかった材料をまとめる。
 * 企画会議が挙げたもの＋プログラムが外したもの＋どこにも出てこなかったもの。
 */
function xPlanFinishUnused_(ctx, plan) {
  var used = {};
  plan.forEach(function (p) { p.materials.forEach(function (m) { used[m.no] = true; }); });
  var all = (ctx.replyList || []).concat(ctx.noteList || []);
  var reasons = {};
  (plan.droppedByCode || []).forEach(function (u) { if (!used[u.no]) reasons[u.no] = u.reason; });
  (plan.unusedFromModel || []).forEach(function (u) { if (!used[u.no] && u.reason) reasons[u.no] = u.reason; });
  ctx.planUnused = all.filter(function (m) { return !used[m.no]; }).map(function (m) {
    return { no: m.no, text: m.text, reason: reasons[m.no] || '（企画会議で言及なし）' };
  });
  var kinds = {};
  plan.forEach(function (p) { kinds[p.core] = true; });
  ctx.planNote = Object.keys(kinds).length < 3
    ? '芯の種類は' + Object.keys(kinds).length + '種類（努力目標の3種類に届かず。材料の都合）'
    : '芯の種類は' + Object.keys(kinds).length + '種類';
}

/**
 * 執筆の依頼に添える「この回の企画」（材料に合わせる方式）。
 * 先に配っていた型・角度・役割の代わりに、企画会議が決めた中身を渡す。
 */
function xPlanTextNew_(weekPlan, from, n) {
  var pats = [];
  try { pats = xReadPatterns_(); } catch (e) { pats = []; }
  var coreOf = function (name) { return X_CORE_TYPES.filter(function (c) { return c.name === name; })[0] || X_CORE_TYPES[0]; };

  var parts = [];
  parts.push('');
  parts.push('## この回の企画（1週間ぶんを先に決めてあります。変えないでください）');
  for (var i = from; i < from + n; i++) {
    var p = weekPlan[i];
    if (!p) continue;
    var c = coreOf(p.core);
    parts.push('### ' + (i + 1) + '本目');
    parts.push('芯: ' + c.name + '（' + c.desc + '）');
    if (p.quote) parts.push('芯になる一文: 「' + p.quote + '」（材料からそのまま。言い換えずに使ってよい）');
    parts.push('読者に残るもの: ' + (p.takeaway || 'なし'));
    if (p.feel) parts.push('読後感: ' + p.feel);
    parts.push('締め方: ' + (p.close || c.close) + '。' + (c.name === '主張' || c.name === '問い' ? '' : '教訓や問いかけを足さない。'));
    if (p.plan) parts.push('企画: ' + p.plan);
    if (p.claim) parts.push('主張: ' + p.claim);
    if (p.role) parts.push('役割: ' + p.role);
    if (p.pattern) {
      var pt = pats.filter(function (x) { return x.name === p.pattern; })[0];
      if (pt) parts.push('型: ' + pt.name + '（骨組み: ' + String(pt.frame).replace(/\n/g, ' ') + '／冒頭: ' + pt.open + '）。締めは型ではなく上の締め方に合わせる');
    }
    if (p.angle) parts.push('角度: ' + X_ANGLES[p.angle - 1]);
    parts.push('冒頭: ' + (p.quoteStart
      ? 'カギカッコ始まりにしてよい（材料にある本人・相手の言葉だけ）'
      : 'カギカッコで始めない'));
    if (p.materials.length) {
      parts.push('使う材料（これだけを使う）:');
      p.materials.forEach(function (m) { parts.push('  [' + m.no + '] ' + m.text); });
    } else {
      parts.push('題材: ' + (p.subject || '仕事の考え方'));
      parts.push('今週の材料はこの枠にはありません。芯に沿って、確認済みのことだけで書いてください。');
      parts.push('方針の表明（〜したい・〜と思っています）で締めるのは、題材が「これからやりたい仕事」のときだけです。');
      parts.push('実績、相談者・お客様の発言、場面や気持ちの描写は作らないでください。');
    }
  }

  var others = [];
  weekPlan.forEach(function (p, i) {
    if (!p || (i >= from && i < from + n)) return;
    var used = p.materials.map(function (m) { return m.no; }).join('・');
    others.push('  ・' + (i + 1) + '本目: 芯=' + p.core + ' / 残るもの=' + (p.takeaway || 'なし') +
      (p.claim ? ' / 主張=' + p.claim : '') + ' / 読後感=' + (p.feel || '') + (used ? '（材料 ' + used + '）' : ''));
  });
  if (others.length) {
    parts.push('');
    parts.push('## 同じ週の他の本（この気づき・主張・読後感と重ねない。この材料を使わない）');
    parts = parts.concat(others);
  }
  return parts.join('\n');
}

/**
 * 企画会議の結果をシートに残す（X_企画会議）。毎回上書き。
 * 採用しなかった材料と、その理由も見られるようにする。
 */
function xWritePlanSheet_(ctx, plan) {
  if (!plan) return;
  var sh = xSheet_('X_企画会議', []);
  sh.clearContents();
  var W = 11;
  var pad = function (r) { while (r.length < W) r.push(''); return r; };
  var out = [];
  out.push(pad(['企画会議（' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + '）', ctx.planNote || '']));
  out.push(pad(['枠', '芯', '材料', '芯になる一文', '読者に残るもの', '読後感', '締め方', '型', '角度', '役割', '企画・主張・注意']));
  plan.forEach(function (p, i) {
    out.push(pad([i + 1, p.core,
      p.materials.map(function (m) { return m.no; }).join('+') || ('題材: ' + p.subject),
      p.quote, p.takeaway || 'なし', p.feel, p.close, p.pattern || 'なし', p.angle ? String(p.angle) : 'なし', p.role,
      [p.plan, p.claim ? '主張: ' + p.claim : '', (p.issues || []).length ? '注意: ' + p.issues.join('／') : ''].filter(String).join('\n')]));
  });
  out.push(pad(['']));
  out.push(pad(['採用しなかった材料', '番号', '理由', '材料']));
  (ctx.planUnused || []).forEach(function (u) { out.push(pad(['', u.no, u.reason, u.text])); });
  if (!(ctx.planUnused || []).length) out.push(pad(['', '（なし）']));
  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.getRange(1, 1, out.length, W).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(4, 260);
  sh.setColumnWidth(11, 300);
}

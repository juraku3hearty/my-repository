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

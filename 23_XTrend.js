/**
 * 23_XTrend.js
 * 閲覧が伸びやすい系統を調べる
 *
 * 過去の投稿は「中身」ではなく「数字」だけ使う。
 *   ・各投稿を、役割（週の役割配分）と分類（紫微斗数の8分類）に振り分ける
 *   ・振り分けごとに、インプレッションといいねの中央値を比べる
 *   ・結果は「どの系統が読まれやすいか」として投稿案に渡す（本文は渡さない）
 *
 * 平均ではなく中央値で比べるのは、互助会で伸びた回のような
 * 極端に大きい数本に引っぱられないため。
 *
 * インプレッションだけでは「その先につながったか」が分からない。
 * 互助で表示が伸びても、自分から関わりにいかなければフォローや会話には続かない。
 * なので返信・新しいフォロー・プロフィールへのアクセスも並べて見る。
 * この3つは0の投稿が多く中央値が0になるため、1本あたりの平均で出す。
 *
 * 振り分けは X_系統分析 にポストIDごとに残すので、2回目以降は新しい投稿だけを振り分ける。
 */

/** この件数に満たない系統は「参考」扱いにする */
var X_TREND_MIN_N = 5;

/** 1回のAPI呼び出しで振り分ける件数 */
var X_TREND_BATCH = 40;

/** 投稿してからこの日数に満たないものは、数字が育っていないので外す */
var X_TREND_MATURE_DAYS = 3;

/** X_系統分析 の列 */
var X_TREND_HEADERS = ['ポストID', '日付', '冒頭', 'インプレッション', 'いいね', '返信',
  '新しいフォロー', 'プロフィールへのアクセス', '役割', '分類', '話題', '除外'];

/**
 * メニューから呼ぶ。X_反応データ の自分の投稿を振り分けて集計する。
 */
function xAnalyzeTrends() {
  var started = Date.now();
  var posts = xTrendPosts_();
  if (!posts.length) {
    xToast_('X_反応データ に自分の投稿がありません。先にCSVを貼ってください。');
    return;
  }

  var sh = xSheet_('X_系統分析', X_TREND_HEADERS);
  var done = xTrendDone_(sh);
  var todo = posts.filter(function (p) { return !done[p.id]; });

  var roles = xSettingLines_(xReadSetting_(), '週の役割配分', X_DEFAULT_ROLES)
    .map(function (l) { return l.replace(/\s*[:：]\s*[0-9０-９]+\s*本?$/, '').trim(); });
  var cats = X_CATEGORIES.map(function (c) { return c.name; });

  // 新しい投稿だけを、まとめて並列で振り分ける
  var batches = [];
  for (var i = 0; i < todo.length; i += X_TREND_BATCH) batches.push(todo.slice(i, i + X_TREND_BATCH));

  var results = xClaudeBatch_(batches.map(function (b) {
    return {
      system: xTrendSystem_(roles, cats),
      userText: b.map(function (p, k) {
        return '[' + k + '] ' + p.body.replace(/\s+/g, ' ').slice(0, 160);
      }).join('\n'),
      maxTokens: 12000,
      effort: 'low'
    };
  }));

  var added = [];
  var skipped = 0;
  for (var bi = 0; bi < batches.length; bi++) {
    var r = results[bi];
    var list = [];
    if (r && r.ok) {
      try { list = (xParseJson_(r.text).items || []); } catch (e) { list = []; }
    }
    var byIdx = {};
    list.forEach(function (x) { byIdx[Number(x.i)] = x; });

    batches[bi].forEach(function (p, k) {
      var x = byIdx[k];
      if (!x) { skipped++; return; }
      added.push([p.id, p.date, p.body.replace(/\s+/g, ' ').slice(0, 60), p.imp, p.like, p.reply,
        p.follow, p.profile,
        String(x['役割'] || ''), String(x['分類'] || ''), String(x['話題'] || ''), p.excluded ? '除外' : '']);
    });
  }

  if (added.length) {
    var width = Math.max(sh.getLastColumn(), X_TREND_HEADERS.length);
    var rows = added.map(function (row) { while (row.length < width) row.push(''); return row; });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  }

  // 数字は最新のCSVで上書きする（伸びたあとの数字を使うため）
  xTrendRefreshNumbers_(sh, posts);

  var summary = xTrendSummary_(sh);
  xWriteTrendSummary_(summary);

  var msg = posts.length + '件のうち' + added.length + '件を新しく振り分けました' +
    (skipped ? '（' + skipped + '件は振り分けできず。もう一度押すと続きをやります）' : '') +
    '。結果は X_系統の傾向 にあります（' + Math.round((Date.now() - started) / 1000) + '秒）。';
  Logger.log(msg);
  xToast_(msg);
}

/** 振り分けの指示 */
function xTrendSystem_(roles, cats) {
  return [
    'X の投稿を、決められた区分に振り分けてください。',
    '各行は [番号] 投稿の冒頭（約150字で切れています） です。',
    '',
    '■ 役割（1つ選ぶ）',
    roles.map(function (r) { return '・' + r; }).join('\n'),
    '',
    '■ 分類（1つ選ぶ）',
    X_CATEGORIES.map(function (c) { return '・' + c.name + '（' + c.desc + '）'; }).join('\n'),
    '',
    '■ 話題',
    '何についての投稿かを15字以内で。',
    '',
    '冒頭しか無いので、迷ったら書き出しから読み取れる範囲で一番近いものを選んでください。',
    '出力はJSONのみ。説明やコードフェンスは付けないでください。',
    '{"items":[{"i":0,"役割":"…","分類":"…","話題":"…"}]}'
  ].join('\n');
}

/** X_反応データ から自分の投稿を読む（返信は除く） */
function xTrendPosts_() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });
  var exCol = head.indexOf('除外');
  if (ci.body < 0) return [];

  var num = function (row, idx) {
    if (idx < 0) return 0;
    var x = parseInt(String(row[idx] || '0').replace(/,/g, ''), 10);
    return isNaN(x) ? 0 : x;
  };

  var dates = [];
  var out = [];
  var seen = {};
  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body || body.charAt(0) === '@') continue;

    var id = ci.id >= 0 ? String(values[r][ci.id] || '').trim() : '';
    if (!id) id = 'row' + r + ':' + body.slice(0, 20);
    if (seen[id]) continue;          // 期間が重なるCSVを続けて貼っても二重に数えない
    seen[id] = true;

    var d = ci.date >= 0 ? xParseDate_(values[r][ci.date]) : null;
    if (d) dates.push(d);
    out.push({
      id: id, d: d,
      date: d ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') : '',
      body: body,
      imp: num(values[r], ci.imp), like: num(values[r], ci.like), reply: num(values[r], ci.reply),
      follow: num(values[r], ci.follow), profile: num(values[r], ci.profile),
      excluded: exCol >= 0 && String(values[r][exCol] || '').trim() !== ''
    });
  }

  // 投稿したばかりのものは外す（データの最新日から数える）
  if (dates.length) {
    var latest = new Date(Math.max.apply(null, dates));
    var limit = new Date(latest.getTime() - (X_TREND_MATURE_DAYS - 1) * 24 * 3600 * 1000);
    limit.setHours(0, 0, 0, 0);
    out = out.filter(function (p) { return !p.d || p.d < limit; });
  }
  return out;
}

/** すでに振り分けたポストID */
function xTrendDone_(sh) {
  var done = {};
  if (sh.getLastRow() < 2) return done;
  var c = X_TREND_HEADERS.indexOf('役割');
  sh.getRange(2, 1, sh.getLastRow() - 1, X_TREND_HEADERS.length).getValues().forEach(function (r) {
    if (String(r[0]).trim() && String(r[c]).trim()) done[String(r[0]).trim()] = true;
  });
  return done;
}

/** 最新のCSVの数字で、インプレッション・いいね・返信・除外を書き直す */
function xTrendRefreshNumbers_(sh, posts) {
  if (sh.getLastRow() < 2) return;
  var byId = {};
  posts.forEach(function (p) { byId[p.id] = p; });

  var n = sh.getLastRow() - 1;
  var values = sh.getRange(2, 1, n, X_TREND_HEADERS.length).getValues();
  var H = function (name) { return X_TREND_HEADERS.indexOf(name); };
  values.forEach(function (r) {
    var p = byId[String(r[0]).trim()];
    if (!p) return;
    r[H('インプレッション')] = p.imp;
    r[H('いいね')] = p.like;
    r[H('返信')] = p.reply;
    r[H('新しいフォロー')] = p.follow;
    r[H('プロフィールへのアクセス')] = p.profile;
    // 除外は、反応データ側か、このシートで手で付けた印のどちらかがあれば除外
    if (p.excluded) r[H('除外')] = '除外';
  });
  sh.getRange(2, 1, n, X_TREND_HEADERS.length).setValues(values);
}

/**
 * 系統ごとの中央値を出す。
 * @return {Object} { total, overall, byRole:[...], byCat:[...] }
 */
function xTrendSummary_(sh) {
  var H = function (name) { return X_TREND_HEADERS.indexOf(name); };
  var rows = sh.getLastRow() < 2 ? [] :
    sh.getRange(2, 1, sh.getLastRow() - 1, X_TREND_HEADERS.length).getValues()
      .filter(function (r) { return String(r[0]).trim() && !String(r[H('除外')]).trim(); });

  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function avg(a) {
    if (!a.length) return 0;
    return Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10;
  }
  var col = function (list, name) { return list.map(function (r) { return Number(r[H(name)]) || 0; }); };

  function group(colName) {
    var g = {};
    rows.forEach(function (r) {
      var k = String(r[H(colName)]).trim() || '（不明）';
      (g[k] = g[k] || []).push(r);
    });
    return Object.keys(g).map(function (k) {
      var list = g[k];
      return {
        name: k, n: list.length,
        imp: median(list.map(function (r) { return Number(r[H('インプレッション')]) || 0; })),
        like: median(col(list, 'いいね')),
        reply: avg(col(list, '返信')),
        follow: avg(col(list, '新しいフォロー')),
        profile: avg(col(list, 'プロフィールへのアクセス')),
        topics: list.slice().sort(function (a, b) {
          return (Number(b[H('インプレッション')]) || 0) - (Number(a[H('インプレッション')]) || 0);
        }).slice(0, 3).map(function (r) { return String(r[H('話題')]); })
      };
    }).sort(function (a, b) { return b.imp - a.imp; });
  }

  return {
    total: rows.length,
    overall: median(col(rows, 'インプレッション')),
    overallReply: avg(col(rows, '返信')),
    overallFollow: avg(col(rows, '新しいフォロー')),
    overallProfile: avg(col(rows, 'プロフィールへのアクセス')),
    byRole: group('役割'),
    byCat: group('分類')
  };
}

/** 集計結果をシートに書く（人が見る用） */
function xWriteTrendSummary_(sum) {
  var sh = xSheet_('X_系統の傾向', []);
  sh.clearContents();

  var W = 8;
  var pad = function (row) { while (row.length < W) row.push(''); return row; };
  var out = [];
  out.push(pad(['閲覧が伸びやすい系統 / つながりやすい系統']));
  out.push(pad(['対象: ' + sum.total + '件（除外・投稿' + X_TREND_MATURE_DAYS + '日未満を除く）　' +
    '全体: インプ中央値 ' + sum.overall + ' / 1本あたり 返信 ' + sum.overallReply +
    '・フォロー ' + sum.overallFollow + '・プロフィール ' + sum.overallProfile]));
  out.push(pad(['※ インプ・いいねは中央値（互助会などで極端に伸びた数本に引っぱられないため）。' +
    '返信・フォロー・プロフィールは0が多いので1本あたりの平均。' + X_TREND_MIN_N + '件未満は参考値。']));
  out.push(pad(['']));

  function block(title, list) {
    out.push([title, '件数', 'インプ中央値', 'いいね中央値', '返信/本', 'フォロー/本', 'プロフィール/本', '伸びた話題（上位3つ）']);
    list.forEach(function (g) {
      out.push([g.name + (g.n < X_TREND_MIN_N ? '（参考）' : ''), g.n, g.imp, g.like,
        g.reply, g.follow, g.profile, g.topics.join(' / ')]);
    });
    out.push(pad(['']));
  }
  block('■ 役割別', sum.byRole);
  block('■ 分類別', sum.byCat);

  sh.getRange(1, 1, out.length, W).setValues(out);
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(W, 420);
}

/**
 * 投稿案の生成に渡す文。系統の傾向だけで、過去の本文は含めない。
 * 集計がまだ無ければ空文字。
 */
function xTrendText_() {
  var sh = xBook_().getSheetByName('X_系統分析');
  if (!sh || sh.getLastRow() < 2) return '';

  var sum = xTrendSummary_(sh);
  var line = function (g) { return g.name + '（中央値' + g.imp + '・' + g.n + '件）'; };
  var connect = function (g) {
    return g.name + '（返信' + g.reply + '・フォロー' + g.follow + '・プロフィール' + g.profile + '/本）';
  };
  var reliable = function (list) { return list.filter(function (g) { return g.n >= X_TREND_MIN_N && g.name !== '（不明）'; }); };

  var roles = reliable(sum.byRole);
  var cats = reliable(sum.byCat);
  if (!roles.length && !cats.length) return '';

  var parts = [];
  parts.push('全体の中央値: ' + sum.overall + '（' + sum.total + '件）');
  if (roles.length) {
    parts.push('役割別・伸びやすい順: ' + roles.map(line).join(' / '));
  }
  if (cats.length) {
    parts.push('分類別・伸びやすい順: ' + cats.map(line).join(' / '));
  }
  if (roles.length) {
    var byConnect = roles.slice().sort(function (a, b) {
      return (b.follow + b.profile / 10 + b.reply / 10) - (a.follow + a.profile / 10 + a.reply / 10);
    });
    parts.push('役割別・つながりやすい順: ' + byConnect.map(connect).join(' / '));
  }
  return parts.join('\n');
}

// 帝の書 自動生成ジェネレータ
// 命盤データ（iztro）＋基準書テキストを、3つの文字なし背景に自動で重ねて HTML を出力する。
// 構成：表紙 → 王宮地図（朝廷図）→ 本文。どの命盤でも自動で埋まる。
//
// 使い方:
//   node src/build-html.js <陽暦YYYY-M-D> <時刻index 0-12> <性別 男|女>
//   例:  node src/build-html.js 1983-1-8 2 女
// 生成物: web/out/帝の書_<日付>.html  → Chromeで開く → ⌘P → PDF保存（余白なし・背景オン）
//
// 背景画像（web/assets/cover.png / court.png / body.png）が無くてもHTMLは出る（文字だけ）。
// 文字色：表紙＝金/白、本文＝濃い藍。文字は安全エリア内（背景の中央余白）に配置。

const fs = require('fs');
const path = require('path');
const { buildChart } = require('./generate-chart');
const D = require('./ziwei-data');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 星 → 「名前＋強弱記号（色）＋四化（色）」
function starSpan(star) {
  const [sym, scls] = D.BRIGHT[star.brightness] || ['', ''];
  let html = esc(star.name) + (sym ? `<span class="${scls}">${sym}</span>` : '');
  if (star.mutagen) {
    const mcls = D.MUTAGEN_CLASS[star.mutagen] || 's-gold';
    html += `<span class="${mcls}">(${esc(star.mutagen)})</span>`;
  }
  return html;
}

function makeResolver(astro) {
  const map = {};
  astro.palaces.forEach((p) => { map[p.name] = p; });
  // 宮の主星（空宮なら對宮から借りる）
  function resolve(name) {
    const p = map[name];
    if (p && p.majorStars && p.majorStars.length) return { stars: p.majorStars, borrowed: false };
    const opp = map[D.OPP[name]];
    return { stars: opp ? opp.majorStars : [], borrowed: true };
  }
  return { map, resolve };
}

function buildHTML(astro) {
  const { map, resolve } = makeResolver(astro);

  // ── 王宮地図ノード
  const nodes = Object.keys(D.COURT_COORDS).filter((n) => n !== '命宮').map((name) => {
    const c = D.COURT[name];
    const [left, top] = D.COURT_COORDS[name];
    const r = resolve(name);
    const stars = (r.borrowed ? '借 ' : '') + (r.stars.map(starSpan).join(' ') || '—');
    return `<div class="node" style="left:${left}%;top:${top}%;">
      <div class="mean">${esc(c.mean)}</div><div class="role">（${esc(c.role)}）</div>
      <div class="pal">${esc(name)}宮</div><div class="stars">${stars}</div></div>`;
  }).join('\n');

  const center = resolve('命宮');
  const centerStars = (center.borrowed ? '借 ' : '') + (center.stars.map(starSpan).join(' ') || '—');

  // ── 本文テキスト（基準書から自動）
  const cs = center.stars; // 命宮の（借りた）主星
  const borrowNote = center.borrowed
    ? `あなたの命宮には主役の星がなく（空宮）、向かいの宮から「${cs.map((s) => s.name).join('」「')}」を借りて読みます。`
    : '';
  const centerProse = (borrowNote ? `<p>${esc(borrowNote)}</p>` : '')
    + cs.map((s) => `<p>${esc(D.PROSE[s.name] || '')}</p>`).join('');

  const uniq = (arr) => [...new Set(arr)];
  const choList = uniq(cs.flatMap((s) => (D.CHO[s.name] || '').split('・')))
    .map((w) => `<li>${esc(w)}</li>`).join('');
  const tanList = uniq(cs.flatMap((s) => (D.TAN[s.name] || '').split('・')))
    .map((w) => `<li>${esc(w)}</li>`).join('');

  const kan = resolve('官祿');
  const kanText = (kan.borrowed ? '（向かいの宮を参考に）' : '')
    + kan.stars.map((s) => D.KAN[s.name]).filter(Boolean).join('。') + '。';
  const fuu = resolve('夫妻');
  const fuuText = (fuu.borrowed ? '（向かいの宮を参考に）' : '')
    + fuu.stars.map((s) => D.FUU[s.name]).filter(Boolean).join('。') + '。';

  const body = astro.palaces.find((p) => p.isBodyPalace);
  const facts = `<b>生年月日</b> ${esc(astro.solarDate)}　／　<b>性別</b> ${esc(astro.gender)}　／　`
    + `<b>五行局</b> ${esc(astro.fiveElementsClass)}　／　<b>身宮</b> ${body ? esc(body.name) + '宮' : '—'}`;

  return { nodes, centerStars, centerProse, choList, tanList, kanText, fuuText, facts };
}

function render(astro, opts = {}) {
  const h = buildHTML(astro);
  const name = opts.name || '';
  const cmd = D.COURT_COORDS['命宮'];
  const ASSET = '../assets';
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>帝の書 ― 自分のトリセツ</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;600;700&family=Shippori+Mincho:wght@600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');
:root{--navy:#10264B;--gold:#D6B06A;--ivory:#F8F4EB;--ink:#26303f;--ink-soft:#5b6678;
 --silver:#9aa0ab;--bronze:#B0834A;--soft-red:#B5524A;
 --serif:'Shippori Mincho','Noto Serif JP',serif;--sans:'Noto Sans JP',sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:var(--sans);color:var(--ink);background:#566;}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;margin:8mm auto;
 background-size:cover;background-position:center;background-repeat:no-repeat;background-color:var(--ivory);}
@media print{@page{size:A4;margin:0;}body{background:none;}.page{margin:0;page-break-after:always;}}
.s-gold{color:var(--gold);}.s-silver{color:var(--silver);}.s-bronze{color:var(--bronze);}.s-red{color:var(--soft-red);}

/* 表紙（暗い背景→金/白文字） */
.cover{background-image:url('${ASSET}/cover.png');color:var(--ivory);}
.cover>div{position:absolute;left:0;right:0;text-align:center;}
.cover .kicker{top:7%;font-weight:500;letter-spacing:.5em;font-size:13pt;color:var(--gold);text-indent:.5em;text-shadow:0 1px 6px rgba(0,0,0,.5);}
.cover .ttl{top:13.5%;font-family:var(--serif);font-weight:800;font-size:50pt;letter-spacing:.05em;color:#FFFDF8;text-shadow:0 2px 16px rgba(0,0,0,.5);}
.cover .sub{top:24%;font-family:var(--serif);font-size:13pt;letter-spacing:.16em;color:var(--ivory);text-shadow:0 1px 8px rgba(0,0,0,.55);}
.cover .name{top:29.5%;font-family:var(--serif);font-weight:600;font-size:16pt;letter-spacing:.1em;color:#F1DDAE;text-shadow:0 1px 8px rgba(0,0,0,.55);}
.cover .ti{top:44.5%;font-family:var(--serif);font-weight:800;font-size:34pt;color:var(--navy);}
.cover .msg{top:58%;font-family:var(--serif);font-weight:700;font-size:30pt;letter-spacing:.12em;color:#3a2410;text-shadow:0 1px 12px rgba(255,245,210,.65);}
.cover .pill{top:69%;}
.cover .pill span{display:inline-block;font-size:11pt;letter-spacing:.12em;color:var(--navy);
 background:rgba(255,253,248,.8);border:1px solid rgba(16,38,75,.5);border-radius:30px;padding:5px 20px;}
.cover .foot{bottom:4%;font-size:9.5pt;letter-spacing:.08em;color:#3a2410;}

/* 王宮地図 */
.court{background-image:url('${ASSET}/court.png');}
.court .hd{position:absolute;top:16mm;left:0;right:0;text-align:center;}
.court .hd h2{font-family:var(--serif);font-weight:700;font-size:22pt;color:var(--navy);letter-spacing:.08em;}
.court .hd p{font-size:10pt;color:var(--ink-soft);margin-top:2.5mm;letter-spacing:.06em;}
.court-map{position:absolute;inset:0;}
.node{position:absolute;transform:translate(-50%,-50%);width:33mm;text-align:center;}
.node .mean{font-family:var(--serif);font-weight:700;font-size:11pt;color:var(--navy);line-height:1.15;}
.node .role{font-size:7.5pt;color:#b88a3a;}
.node .pal{font-size:6.5pt;color:var(--ink-soft);}
.node .stars{font-size:8.5pt;color:var(--ink);margin-top:1px;line-height:1.2;}
.throne{position:absolute;transform:translate(-50%,-50%);width:46mm;text-align:center;}
.throne .ti{font-family:var(--serif);font-weight:800;font-size:32pt;color:var(--navy);line-height:1;}
.throne .me{font-size:8.5pt;color:#6a5a3a;margin-top:1mm;}
.throne .ts{font-size:9.5pt;margin-top:1mm;color:var(--ink);}
.court .legend{position:absolute;bottom:15mm;left:0;right:0;text-align:center;font-size:8.5pt;color:var(--ink-soft);}

/* 本文（クリーム→濃い藍文字） */
.body-page{background-image:url('${ASSET}/body.png');padding:30mm 26mm;}
.bh{text-align:center;margin-bottom:9mm;}
.bh .bk{font-size:9pt;letter-spacing:.3em;color:var(--gold);}
.bh .t{font-family:var(--serif);font-weight:700;font-size:18pt;color:var(--navy);margin-top:2mm;letter-spacing:.06em;}
.facts{font-size:10pt;color:var(--ink-soft);background:rgba(214,176,106,.12);border-radius:6px;
 padding:4mm 5mm;margin-bottom:8mm;line-height:1.9;}.facts b{color:var(--navy);font-weight:500;}
.sec{margin-bottom:8mm;}
.sec .h{display:flex;align-items:center;gap:3mm;border-bottom:1px solid rgba(214,176,106,.6);padding-bottom:2mm;margin-bottom:3mm;}
.sec .h svg{width:8.5mm;height:8.5mm;flex:0 0 8.5mm;}
.sec .h h3{font-family:var(--serif);font-weight:700;font-size:14pt;color:var(--navy);letter-spacing:.04em;}
.sec p{font-size:11pt;line-height:2;margin-bottom:3mm;}
.sec ul{list-style:none;display:flex;flex-wrap:wrap;gap:2mm 5mm;}
.sec li{font-size:11pt;line-height:1.8;position:relative;padding-left:5mm;}
.sec li::before{content:"◆";position:absolute;left:0;color:var(--gold);font-size:8pt;top:2px;}
.note{font-size:8.5pt;line-height:1.7;color:var(--ink-soft);border-top:1px solid rgba(214,176,106,.5);padding-top:3mm;margin-top:7mm;}
</style></head><body>

<section class="page cover">
  <div class="kicker">紫微斗数 × 帝王学</div>
  <div class="ttl">自分のトリセツ</div>
  <div class="sub">命盤からひもとく、あなたという人</div>
  ${name ? `<div class="name">— ${esc(name)} さま —</div>` : ''}
  <div class="ti">帝</div>
  <div class="msg">あなたが主役。</div>
  <div class="pill"><span>自己理解の鑑定　／　PDFでお届け</span></div>
  <div class="foot">${h.facts.replace(/<[^>]+>/g, '')}</div>
</section>

<section class="page court">
  <div class="hd"><h2>あなたの王宮地図</h2><p>命宮を帝とし、十二宮を朝廷として ― あなたを支える役職と臣下たち</p></div>
  <div class="court-map">
    ${h.nodes}
    <div class="throne" style="left:${cmd[0]}%;top:${cmd[1]}%;"><div class="ti">帝</div><div class="me">＝ あなた（命宮）</div><div class="ts">${h.centerStars}</div></div>
  </div>
  <div class="legend">臣下＝主星　<span class="s-gold">◎</span>強 <span class="s-silver">○</span>中 <span class="s-bronze">◇</span>並 <span class="s-red">△</span>課題　／　(祿)(權)(科)(忌)＝四化　／　借＝向かいの宮から　／　命盤計算：iztro</div>
</section>

<section class="page body-page">
  <div class="bh"><div class="bk">帝 の 書　／　自分のトリセツ</div><div class="t">あなたという人</div>${name ? `<div style="font-size:11pt;color:#6a5a3a;margin-top:1.5mm;letter-spacing:.08em;">${esc(name)} さま</div>` : ''}</div>
  <div class="facts">${h.facts}</div>
  <div class="sec"><div class="h">
    <svg viewBox="0 0 24 24" fill="none" stroke="#D6B06A" stroke-width="1.6"><path d="M3 8l4 4 5-7 5 7 4-4v9H3z"/></svg><h3>あなたの中心にあるもの（命宮）</h3></div>
    ${h.centerProse}</div>
  <div class="sec"><div class="h">
    <svg viewBox="0 0 24 24" fill="none" stroke="#D6B06A" stroke-width="1.6"><circle cx="12" cy="12" r="5"/><g stroke-linecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/></g></svg><h3>あなたの強み</h3></div>
    <ul>${h.choList}</ul></div>
  <div class="sec"><div class="h">
    <svg viewBox="0 0 24 24" fill="none" stroke="#D6B06A" stroke-width="1.6"><path d="M16 3a8 8 0 1 0 5 14.5A9 9 0 0 1 16 3z"/></svg><h3>気をつけたいクセ</h3></div>
    <p>これは欠点ではなく、強みが少し行きすぎたときに出るクセです。知っておくと、扱いやすくなります。</p>
    <ul>${h.tanList}</ul></div>
</section>

<section class="page body-page">
  <div class="sec"><div class="h">
    <svg viewBox="0 0 24 24" fill="none" stroke="#D6B06A" stroke-width="1.6"><circle cx="12" cy="12" r="9.5"/><path d="M12 5l2.5 6.5L12 19l-2.5-7.5z" fill="#D6B06A" stroke="none"/></svg><h3>活かし方（仕事・社会）</h3></div>
    <p>あなたが力を発揮しやすいのは、こんな場です。${esc(h.kanText)}人前に立って持ち味を活かすほど、信頼や評価につながります。</p></div>
  <div class="sec"><div class="h">
    <svg viewBox="0 0 24 24" fill="none" stroke="#D6B06A" stroke-width="1.6"><circle cx="8.5" cy="12" r="5"/><circle cx="15.5" cy="12" r="5"/></svg><h3>人間関係・ご縁</h3></div>
    <p>人との関わりでは、こんな傾向があります。${esc(h.fuuText)}気持ちを溜め込まず、短くていいから言葉にしてみる。それが、あなたのご縁のいちばんの鍵になります。</p></div>
  <div class="note">
    ※ 本鑑定は紫微斗数の命盤にもとづく「持ち味の傾向」をお伝えするものです。未来を断定したり、優劣を決めたりするものではありません。<br>
    ※ 解釈は本サービスの「基準書」のみを根拠にし、主星と四化を中心に読みます。基準書に項目のない細かな星は今回は扱っていません。<br>
    ※ 本鑑定は自己理解を目的としたもので、医療・法律・投資などの専門的助言ではありません。命盤計算：iztro。
  </div>
</section>
</body></html>`;
}

function main() {
  const [solarDate, timeIndexRaw, gender] = process.argv.slice(2);
  if (!solarDate || timeIndexRaw === undefined || !gender) {
    console.error('使い方: node src/build-html.js <陽暦YYYY-M-D> <時刻index 0-12> <性別 男|女>');
    process.exit(1);
  }
  const astro = buildChart(solarDate, Number(timeIndexRaw), gender);
  const html = render(astro);
  const outDir = path.join(__dirname, '..', 'web', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `帝の書_${solarDate}.html`);
  fs.writeFileSync(out, html);
  console.log('HTML を出力しました: ' + out);
  return out;
}

if (require.main === module) main();
module.exports = { render, buildHTML };

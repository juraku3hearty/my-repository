// 帝の書 PDF 直接生成（私の環境で描画を確認できる方式）
// 背景(原寸PNG)＋命盤データ＋基準書テキストを canvas で合成し、各ページをJPEGにして PDF 化。
// プレビューで詰めた座標そのままなので「見た通りのPDF」になる。
//   実行: node src/build-pdf.js <陽暦> <時刻index> <性別> [出力名]
//   一括: node src/build-pdf.js  （家族5人）

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const PDFDocument = require('pdfkit');
const { buildChart } = require('./generate-chart');
const D = require('./ziwei-data');

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 'jp');
// 明朝があれば使う（web/assets/fonts/ に .otf/.ttf があれば登録）
let SERIF = 'jp';
try {
  const fdir = path.join(__dirname, '..', 'web', 'assets', 'fonts');
  const ff = fs.readdirSync(fdir).find((f) => /\.(otf|ttf|ttc)$/i.test(f));
  if (ff) { GlobalFonts.registerFromPath(path.join(fdir, ff), 'mincho'); SERIF = 'mincho'; }
} catch (e) { /* なければゴシック */ }

const ASSETS = path.join(__dirname, '..', 'web', 'assets');
const SC = 2;                 // 2倍解像度（文字くっきり）
const W = 1054 * SC, H = 1492 * SC;
const X = (p) => W * p / 100, Y = (p) => H * p / 100;

const COL = { navy: '#10264B', ink: '#26303f', soft: '#6a5a3a', gold: '#b88a3a', goldL: '#E7C77E',
  white: '#FFFDF8', ivory: '#F8F4EB', warm: '#3a2410', line: 'rgba(214,176,106,.55)' };
const BM = { 廟: ['◎', '#C99A3A'], 旺: ['◎', '#C99A3A'], 得: ['○', '#9aa0ab'], 利: ['○', '#9aa0ab'],
  平: ['◇', '#B0834A'], 不: ['△', '#B5524A'], 陷: ['△', '#B5524A'] };
const MM = { 祿: '#C99A3A', 權: '#C99A3A', 科: '#C99A3A', 忌: '#B5524A' };

function resolver(astro) {
  const map = {}; astro.palaces.forEach((p) => { map[p.name] = p; });
  return (n) => { const p = map[n]; if (p && p.majorStars.length) return { stars: p.majorStars, b: false };
    const o = map[D.OPP[n]]; return { stars: o ? o.majorStars : [], b: true }; };
}
function starSegs(stars, borrowed) {
  const segs = []; if (borrowed) segs.push(['借 ', COL.soft]);
  stars.forEach((s, i) => { if (i) segs.push(['　', COL.ink]); segs.push([s.name, COL.ink]);
    const b = BM[s.brightness]; if (b) segs.push([b[0], b[1]]);
    if (s.mutagen) segs.push([`(${s.mutagen})`, MM[s.mutagen] || COL.gold]); });
  return segs;
}
function drawSegsCentered(x, cx, cy, segs, font, maxw, lh) {
  x.font = font;
  let lines = [[]], w = 0;
  for (const sg of segs) { const sw = x.measureText(sg[0]).width;
    if (w + sw > maxw && lines[lines.length - 1].length) { lines.push([]); w = 0; }
    lines[lines.length - 1].push(sg); w += sw; }
  let yy = cy - (lines.length - 1) * lh / 2;
  for (const ln of lines) { const tot = ln.reduce((a, s) => a + x.measureText(s[0]).width, 0);
    let sx = cx - tot / 2; x.textAlign = 'left';
    for (const [t, c] of ln) { x.fillStyle = c; x.fillText(t, sx, yy); sx += x.measureText(t).width; } yy += lh; }
  x.textAlign = 'center';
}
// 行頭に置けない文字（句読点・閉じ括弧・小書きなど）＝行頭禁則。来そうなら前行末にぶら下げる。
const NO_LINE_START = '、。，．・：；！？」』）】〕》〉”’ーぁぃぅぇぉっゃゅょゎ々';
// 各行を {t:文字列, full:両端揃え対象か} で返す。full行は枠幅に揃える、最終行/改行/ぶら下げ行は自然な左揃え。
function wrap(x, text, maxw, font) {
  x.font = font; const out = []; let line = '';
  for (const ch of text) {
    if (ch === '\n') { out.push({ t: line, full: false }); line = ''; continue; }
    if (line && x.measureText(line + ch).width > maxw) {
      if (NO_LINE_START.includes(ch)) { line += ch; out.push({ t: line, full: false }); line = ''; } // ぶら下げ
      else { out.push({ t: line, full: true }); line = ch; }
    } else line += ch;
  }
  if (line) out.push({ t: line, full: false });
  return out;
}
// 両端揃え描画（fullのときは字間を均等に広げて枠幅に揃える）。textAlign='left'前提。
function drawLine(x, L, ML, y, maxw) {
  const chars = [...L.t];
  if (!L.full || chars.length < 2) { x.fillText(L.t, ML, y); return; }
  const extra = maxw - x.measureText(L.t).width;
  const gap = extra / (chars.length - 1);
  const cap = (parseFloat(x.font) || 20) * 0.8;
  if (gap < 0 || gap > cap) { x.fillText(L.t, ML, y); return; } // 間延びしすぎる時は左揃え
  let cx = ML;
  for (const ch of chars) { x.fillText(ch, cx, y); cx += x.measureText(ch).width + gap; }
}

async function renderCover(astro, name, transparent = false) {
  const c = createCanvas(W, H); const x = c.getContext('2d');
  if (!transparent) { const img = await loadImage(path.join(ASSETS, 'cover.png')); x.drawImage(img, 0, 0, W, H); }
  x.textAlign = 'center'; x.textBaseline = 'middle'; const cx = W / 2;
  const sh = (col, b) => { x.shadowColor = col; x.shadowBlur = b * SC; };
  sh('rgba(0,0,0,.5)', 8); x.fillStyle = COL.goldL; x.font = `${22 * SC}px ${SERIF}`; x.fillText('紫 微 斗 数  ×  帝 王 学', cx, Y(7));
  sh('rgba(0,0,0,.55)', 16); x.fillStyle = COL.white; x.font = `bold ${84 * SC}px ${SERIF}`; x.fillText('自分のトリセツ', cx, Y(13.5));
  sh('rgba(0,0,0,.6)', 8); x.fillStyle = COL.ivory; x.font = `${22 * SC}px ${SERIF}`; x.fillText('命盤からひもとく、あなたという人', cx, Y(22.5));
  if (name) { x.fillStyle = '#F1DDAE'; x.font = `bold ${27 * SC}px ${SERIF}`; x.fillText(`— ${name} さま —`, cx, Y(27.5)); }
  // 表紙の「帝」は廃止（朝日そのものを主役に）。王宮地図の中央には帝を残す。
  sh('rgba(255,245,210,.6)', 12); x.fillStyle = COL.warm; x.font = `bold ${52 * SC}px ${SERIF}`; x.fillText('あなたが主役。', cx, Y(60));
  sh('rgba(0,0,0,0)', 0);
  x.font = `${18 * SC}px ${SERIF}`; const t = '自己理解の鑑定　／　PDFでお届け';
  const tw = x.measureText(t).width, pw = tw + 54 * SC, ph = 42 * SC, py = Y(69) - ph / 2, pxx = cx - pw / 2;
  x.fillStyle = 'rgba(255,253,248,.85)'; x.beginPath(); x.roundRect(pxx, py, pw, ph, 21 * SC); x.fill();
  x.strokeStyle = 'rgba(16,38,75,.55)'; x.lineWidth = 1.5 * SC; x.beginPath(); x.roundRect(pxx, py, pw, ph, 21 * SC); x.stroke();
  x.fillStyle = COL.navy; x.fillText(t, cx, Y(69));
  const body = astro.palaces.find((p) => p.isBodyPalace);
  x.fillStyle = COL.warm; x.font = `${16 * SC}px ${SERIF}`;
  x.fillText(`${astro.solarDate} 生まれ　／　${astro.gender}　／　五行局 ${astro.fiveElementsClass}`, cx, Y(95.5));
  return c;
}

async function renderCourt(astro, transparent = false) {
  const c = createCanvas(W, H); const x = c.getContext('2d');
  if (!transparent) { const img = await loadImage(path.join(ASSETS, 'court.png')); x.drawImage(img, 0, 0, W, H); }
  x.textBaseline = 'middle';
  const res = resolver(astro);
  for (const [n, [lx, ly]] of Object.entries(D.COURT_COORDS)) {
    const px = X(lx), py = Y(ly); const info = D.COURT[n]; const r = res(n);
    if (n === '命宮') {
      x.textAlign = 'center'; x.fillStyle = COL.navy; x.font = `bold ${56 * SC}px ${SERIF}`; x.fillText('帝', px, py - 14 * SC);
      x.fillStyle = COL.soft; x.font = `${14 * SC}px ${SERIF}`; x.fillText('＝ あなた（命宮）', px, py + 24 * SC);
      drawSegsCentered(x, px, py + 46 * SC, starSegs(r.stars, r.b), `${15 * SC}px ${SERIF}`, 260 * SC, 19 * SC);
    } else {
      x.textAlign = 'center'; x.fillStyle = COL.navy; x.font = `bold ${22 * SC}px ${SERIF}`; x.fillText(info.mean, px, py - 26 * SC);
      x.fillStyle = COL.gold; x.font = `${13 * SC}px ${SERIF}`; x.fillText(`（${info.role}）`, px, py - 7 * SC);
      x.fillStyle = '#7a7060'; x.font = `${11 * SC}px ${SERIF}`; x.fillText(`${n}宮`, px, py + 7 * SC);
      drawSegsCentered(x, px, py + 24 * SC, starSegs(r.stars, r.b), `${14 * SC}px ${SERIF}`, 120 * SC, 17 * SC);
    }
  }
  return c;
}

// 本文（背景body.png）にセクションを縦に流す。複数ページに自動分割。
// ※ 主星だけでなく「四化」「身宮」を織り込むことで、骨格が似た命盤でも一人ひとり変わる。
function bodyContent(astro) {
  const res = resolver(astro);
  const uniq = (a) => [...new Set(a)];
  const mutOf = (r) => r.stars.filter((s) => s.mutagen).map((s) => `「${s.name}」には、${D.MUT[s.mutagen]}。`).join('');
  const sec = (palace, intro, map, outro) => {
    const r = res(palace);
    return intro + r.stars.map((s) => map[s.name]).filter(Boolean).join('。') + '。' + mutOf(r) + (outro || '');
  };

  const cs = res('命宮'); const stars = cs.stars;
  // 命宮＋三方四正（命・遷・官・財）の六吉＝強み源／六煞＝クセ源（同じ主星でも輔煞が違えば変わる）
  const pmap = {}; astro.palaces.forEach((p) => { pmap[p.name] = p; });
  const triad = ['命宮', '遷移', '官祿', '財帛'];
  const minorNames = (set) => uniq(triad.flatMap((n) => (pmap[n] ? pmap[n].minorStars : []).map((s) => s.name).filter((nm) => set[nm])));
  const kichiAdd = minorNames(D.KICHI).map((nm) => D.KICHI[nm]);
  const satsuAdd = minorNames(D.SATSU).map((nm) => D.SATSU[nm]);

  const note = cs.b ? `あなたの命宮には主役の星がなく（空宮）、向かいの宮から「${stars.map((s) => s.name).join('」「')}」を借りて読みます。` : '';
  const center = (note ? [note] : []).concat(stars.map((s) => D.PROSE[s.name]).filter(Boolean));
  const cmut = stars.filter((s) => s.mutagen).map((s) => `そしてあなたの場合、「${s.name}」に、${D.MUT[s.mutagen]}。`);
  const bodyP = astro.palaces.find((p) => p.isBodyPalace);
  const shin = (bodyP && D.SHIN[bodyP.name]) ? [`また、人生の重心（身宮）は「${D.SHIN[bodyP.name]}」に置かれやすく、ここがあなたの一生で特に大切なテーマになります。`] : [];

  const cho = uniq(stars.flatMap((s) => (D.CHO[s.name] || '').split('・'))).concat(kichiAdd);
  const tan = uniq(stars.flatMap((s) => (D.TAN[s.name] || '').split('・'))).concat(satsuAdd);
  const kanT = sec('官祿', 'あなたが力を発揮しやすいのは、こんな場です。', D.KAN, 'こうした場で持ち味を活かすほど、まわりからの信頼や評価につながっていきます。気負わず、得意なところから動いてみてください。');
  const fuuT = sec('夫妻', '人との関わりでは、こんな傾向があります。', D.FUU, '気持ちを溜め込まず、短くていいから言葉にしてみること。それだけで、すれ違いが減り、ご縁がぐっと深まります。');
  const zaiT = sec('財帛', 'お金とは、こんな付き合い方が向いています。', D.ZAI, '自分に合ったお金のリズムを知っておくと、無理なく豊かさを育てていけます。');
  const fukT = sec('福德', '心がいちばん満たされるのは、こんな時間です。', D.FUK, '忙しいときほど、この「満たされる時間」を意識して取り戻すと、あなたらしさが戻ってきます。');
  const ekiT = sec('疾厄', '体質には、こんな傾向が出やすいようです。', D.SHITSU, 'あくまで傾向で、決めつけではありません。早めに休む・あたためるなど、ちょっとした習慣が、あなたの調子を支えます。');
  const closing = 'ここに書いたのは、あなたが生まれ持った「傾向」です。当たっているところは活かし、ピンとこないところは横に置いて大丈夫。大切なのは、自分を責めずに、持ち味を活かす方へ少しずつ舵を切ること。あなたは、あなたの人生の主役です。どうか、あなたらしく歩んでいってください。';

  return [
    { type: 'h', t: 'あなたの中心にあるもの（命宮）' }, ...center.map((p) => ({ type: 'p', t: p })),
    ...cmut.map((p) => ({ type: 'p', t: p })), ...shin.map((p) => ({ type: 'p', t: p })),
    { type: 'h', t: 'あなたの強み' }, { type: 'p', t: 'あなたが自然にできること、まわりより少し得意なことを挙げると、こんな持ち味があります。' }, { type: 'ul', items: cho },
    { type: 'h', t: '気をつけたいクセ' }, { type: 'p', t: 'これは欠点ではなく、強みが少し行きすぎたときに出るクセです。あらかじめ知っておくと、ぐっと扱いやすくなります。' }, { type: 'ul', items: tan },
    { type: 'h', t: '活かし方（仕事・社会）' }, { type: 'p', t: kanT },
    { type: 'h', t: '人間関係・ご縁' }, { type: 'p', t: fuuT },
    { type: 'h', t: 'お金との付き合い方' }, { type: 'p', t: zaiT },
    { type: 'h', t: '健康・体質の傾向' }, { type: 'p', t: ekiT },
    { type: 'h', t: '心が満たされるとき' }, { type: 'p', t: fukT },
    { type: 'h', t: 'あなたへ' }, { type: 'p', t: closing },
    { type: 'note', t: '※ 本鑑定は紫微斗数の命盤にもとづく「持ち味の傾向」をお伝えするものです。未来を断定したり、優劣を決めたりするものではありません。\n※ 解釈は本サービスの「基準書」のみを根拠にし、主星・四化・身宮を中心に読みます。\n※ 自己理解を目的としたもので、医療・法律・投資などの専門的助言ではありません。命盤計算：iztro。' },
  ];
}

async function renderBodies(astro, name, blocksOverride, transparent = false) {
  const img = transparent ? null : await loadImage(path.join(ASSETS, 'body.png'));
  const blocks = blocksOverride || bodyContent(astro);
  const ML = 130 * SC, MR = W - 130 * SC, contentW = MR - ML;
  const TOP = 175 * SC, BOTTOM = H - 150 * SC;
  const pages = []; let x, c, y; let firstPage = true;
  const newPage = () => {
    c = createCanvas(W, H); x = c.getContext('2d'); if (img) x.drawImage(img, 0, 0, W, H);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; y = TOP;
    if (firstPage) {
      x.textAlign = 'center'; x.fillStyle = COL.gold; x.font = `${15 * SC}px ${SERIF}`;
      x.fillText('帝 の 書　／　自分のトリセツ', W / 2, TOP - 70 * SC);
      x.fillStyle = COL.navy; x.font = `bold ${38 * SC}px ${SERIF}`; x.fillText('あなたという人', W / 2, TOP - 28 * SC);
      if (name) { x.fillStyle = COL.soft; x.font = `${18 * SC}px ${SERIF}`; x.fillText(`${name} さま`, W / 2, TOP + 6 * SC); }
      x.textAlign = 'left'; y = TOP + 40 * SC; firstPage = false;
    }
    pages.push(c);
  };
  newPage();
  const ensure = (need) => { if (y + need > BOTTOM) newPage(); };
  for (const b of blocks) {
    if (b.type === 'h') {
      ensure(78 * SC); y += 26 * SC;
      x.fillStyle = COL.navy; x.font = `bold ${28 * SC}px ${SERIF}`; x.textAlign = 'left'; x.fillText(b.t, ML, y);
      y += 16 * SC; x.strokeStyle = COL.line; x.lineWidth = 1 * SC; x.beginPath(); x.moveTo(ML, y); x.lineTo(MR, y); x.stroke();
      y += 30 * SC;
    } else if (b.type === 'p') {
      const lh = 44 * SC; const lines = wrap(x, b.t, contentW, `${23 * SC}px ${SERIF}`);
      for (const L of lines) { ensure(lh); x.fillStyle = COL.ink; x.font = `${23 * SC}px ${SERIF}`; drawLine(x, L, ML, y, contentW); y += lh; }
      y += 14 * SC;
    } else if (b.type === 'ul') {
      const lh = 40 * SC;
      for (const it of b.items) { ensure(lh); x.fillStyle = COL.gold; x.font = `${14 * SC}px ${SERIF}`; x.fillText('◆', ML, y - 5 * SC);
        x.fillStyle = COL.ink; x.font = `${22 * SC}px ${SERIF}`; x.fillText(it, ML + 30 * SC, y); y += lh; }
      y += 14 * SC;
    } else if (b.type === 'note') {
      y += 22 * SC; x.strokeStyle = COL.line; x.lineWidth = 1 * SC; x.beginPath(); x.moveTo(ML, y); x.lineTo(MR, y); x.stroke(); y += 28 * SC;
      const lh = 30 * SC; const lines = wrap(x, b.t, contentW, `${15 * SC}px ${SERIF}`);
      for (const L of lines) { ensure(lh); x.fillStyle = COL.soft; x.font = `${15 * SC}px ${SERIF}`; drawLine(x, L, ML, y, contentW); y += lh; }
    }
  }
  return pages;
}

// 王宮地図をコードで描画（円も自前で描くので配置ズレ無し・12宮ちょうど・高解像度）。
// 背景はプレーンな羊皮紙(body.png)を下敷きにし、リング・サンバースト・文字を重ねる。
const COURT_ORDER = ['官祿', '父母', '福德', '田宅', '子女', '兄弟', '僕役', '疾厄', '遷移', '財帛', '夫妻']; // 12時から時計回り
async function renderCourtDrawn(astro, transparent = false) {
  const c = createCanvas(W, H); const x = c.getContext('2d');
  if (!transparent) { const bg = await loadImage(path.join(ASSETS, 'body.png')); x.drawImage(bg, 0, 0, W, H); }
  const res = resolver(astro);
  const pmap = {}; astro.palaces.forEach((p) => { pmap[p.name] = p; });
  const bodyName = (astro.palaces.find((p) => p.isBodyPalace) || {}).name;
  const SIXK = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞'], SIXS = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];
  const minorSegs = (n) => { const p = pmap[n]; if (!p) return []; const segs = [];
    p.minorStars.forEach((s) => { const k = SIXK.includes(s.name), z = SIXS.includes(s.name); if (!k && !z) return;
      if (segs.length) segs.push(['　', COL.soft]); segs.push([s.name, k ? '#9c6b3f' : '#B5524A']); });
    return segs; };
  const GOLD = '#C39A4E', GOLD_F = 'rgba(195,154,78,0.42)';
  const cx = W / 2, cy = H * 0.505, rx = W * 0.355, ry = H * 0.285, rc = W * 0.072, discR = W * 0.135;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // 見出し
  x.fillStyle = COL.navy; x.font = `bold ${30 * SC}px ${SERIF}`; x.fillText('あなたの王宮地図', cx, H * 0.066);
  x.fillStyle = COL.soft; x.font = `${12 * SC}px ${SERIF}`; x.fillText('命宮を帝とし、十二宮を朝廷として', cx, H * 0.10);
  // 各宮の座標（11個を楕円に等間隔）
  const pts = COURT_ORDER.map((n, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / COURT_ORDER.length;
    return [n, cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  // 中心へのスポーク
  x.strokeStyle = GOLD_F; x.lineWidth = 1 * SC;
  pts.forEach(([, px, py]) => { x.beginPath(); x.moveTo(cx, cy); x.lineTo(px, py); x.stroke(); });
  // 中心サンバースト
  for (let i = 0; i < 60; i++) { const a = i * Math.PI / 30, long = i % 2 === 0;
    const ri = discR * 0.64, ro = discR * (long ? 1.16 : 1.0);
    x.strokeStyle = long ? 'rgba(195,154,78,.55)' : 'rgba(195,154,78,.3)'; x.lineWidth = (long ? 2.4 : 1.3) * SC;
    x.beginPath(); x.moveTo(cx + ri * Math.cos(a), cy + ri * Math.sin(a)); x.lineTo(cx + ro * Math.cos(a), cy + ro * Math.sin(a)); x.stroke(); }
  // 各宮の円＋ラベル（主星に加え、脇星=六吉六煞と身宮マークも表示＝人ごとに図が変わる）
  pts.forEach(([n, px, py]) => {
    const isBody = (n === bodyName);
    x.beginPath(); x.arc(px, py, rc, 0, 7); x.fillStyle = 'rgba(255,253,248,.6)'; x.fill();
    x.lineWidth = (isBody ? 3.4 : 2) * SC; x.strokeStyle = isBody ? COL.navy : GOLD;
    x.beginPath(); x.arc(px, py, rc, 0, 7); x.stroke();
    if (isBody) { x.fillStyle = COL.navy; x.beginPath(); x.arc(px, py - rc, 12 * SC, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.font = `bold ${12 * SC}px ${SERIF}`; x.fillText('身', px, py - rc); }
    else { x.fillStyle = GOLD; x.font = `${12 * SC}px ${SERIF}`; x.fillText('◆', px, py - rc - 9 * SC); }
    const info = D.COURT[n], r = res(n);
    x.fillStyle = COL.navy; x.font = `bold ${19 * SC}px ${SERIF}`; x.fillText(info.mean, px, py - 33 * SC);
    x.fillStyle = GOLD; x.font = `${11 * SC}px ${SERIF}`; x.fillText(`（${info.role}）`, px, py - 16 * SC);
    x.fillStyle = '#7a7060'; x.font = `${9.5 * SC}px ${SERIF}`; x.fillText(`${n}宮`, px, py - 3 * SC);
    drawSegsCentered(x, px, py + 15 * SC, starSegs(r.stars, r.b), `${13 * SC}px ${SERIF}`, rc * 1.95, 15 * SC);
    const ms = minorSegs(n);
    if (ms.length) drawSegsCentered(x, px, py + 39 * SC, ms, `${11 * SC}px ${SERIF}`, rc * 1.95, 13 * SC);
  });
  // 中心の玉座
  x.beginPath(); x.arc(cx, cy, discR * 0.64, 0, 7); x.fillStyle = '#FBF4E2'; x.fill();
  x.lineWidth = 3 * SC; x.strokeStyle = GOLD; x.beginPath(); x.arc(cx, cy, discR * 0.64, 0, 7); x.stroke();
  const cr = res('命宮');
  x.fillStyle = GOLD; x.font = `${15 * SC}px ${SERIF}`; x.fillText('◆', cx, cy - discR * 0.42);
  x.fillStyle = COL.navy; x.font = `bold ${44 * SC}px ${SERIF}`; x.fillText('帝', cx, cy - discR * 0.06);
  x.fillStyle = COL.soft; x.font = `${13 * SC}px ${SERIF}`; x.fillText('＝ あなた（命宮）', cx, cy + discR * 0.24);
  drawSegsCentered(x, cx, cy + discR * 0.42, starSegs(cr.stars, cr.b), `${14 * SC}px ${SERIF}`, discR * 1.2, 18 * SC);
  const cms = minorSegs('命宮');
  if (cms.length) drawSegsCentered(x, cx, cy + discR * 0.60, cms, `${12 * SC}px ${SERIF}`, discR * 1.2, 15 * SC);
  // 凡例
  x.fillStyle = COL.soft; x.font = `${9 * SC}px ${SERIF}`;
  x.fillText('臣下＝主星　◎強 ○中 ◇並 △課題　／　(祿)(權)(科)(忌)＝四化　／　借＝向かいの宮から', cx, H * 0.95);
  return c;
}

async function buildPDF(astro, name, outPath, blocksOverride) {
  // 各ページは「背景＋文字」を1枚のキャンバスに合成（透明レイヤーは使わない＝どのビューアでも確実に表示）
  const cover = await renderCover(astro, name);
  const court = await renderCourtDrawn(astro);                    // 背景=羊皮紙＋円もコード描画（ズレ無し・12宮）
  const bodies = await renderBodies(astro, name, blocksOverride);
  const pages = [cover, court, ...bodies];
  const A4 = { width: 595.28, height: 841.89 };
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath); doc.pipe(stream);
  pages.forEach((c, i) => {
    if (i) doc.addPage({ size: 'A4', margin: 0 });
    doc.image(c.toBuffer('image/jpeg', 0.94), 0, 0, A4);
  });
  doc.end();
  return new Promise((r) => stream.on('finish', () => r(outPath)));
}

const FAMILY = [
  { name: '平井真弓', solar: '1983-1-8', time: 2, gender: '女' },
  { name: '平井伸幸', solar: '1983-3-14', time: 4, gender: '男' },
  { name: '平井麗波', solar: '2008-8-1', time: 8, gender: '女' },
  { name: '平井絢葉', solar: '2011-12-12', time: 8, gender: '女' },
  { name: '平井琴芭', solar: '2013-7-28', time: 9, gender: '女' },
];

(async () => {
  const a = process.argv.slice(2);
  const outDir = path.join(__dirname, '..', 'web', 'pdf');
  if (a.length >= 3) {
    const astro = buildChart(a[0], Number(a[1]), a[2]);
    await buildPDF(astro, a[3] || '', path.join(outDir, `帝の書_${a[3] || a[0]}.pdf`));
    console.log('PDF出力:', a[3] || a[0]);
  } else {
    for (const m of FAMILY) {
      const astro = buildChart(m.solar, m.time, m.gender);
      const p = await buildPDF(astro, m.name, path.join(outDir, `帝の書_${m.name}.pdf`));
      console.log('PDF出力:', m.name, Math.round(fs.statSync(p).size / 1024) + 'KB');
    }
  }
})();

module.exports = { buildPDF, renderCover, renderCourt, renderCourtDrawn, renderBodies };

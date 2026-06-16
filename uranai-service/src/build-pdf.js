// 帝の書 PDF 直接生成（私の環境で描画を確認できる方式）
// 背景(原寸PNG)＋命盤データ＋基準書テキストを canvas で合成し、各ページをJPEGにして PDF 化。
// プレビューで詰めた座標そのままなので「見た通りのPDF」になる。
//   実行: node src/build-pdf.js <陽暦> <HH:MM> <都道府県> <性別> [名前]　…真太陽時で時刻を自動補正
//   旧式: node src/build-pdf.js <陽暦> <時刻index 0-12> <性別> [名前]　（互換）
//   一括: node src/build-pdf.js  （家族5人）

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const PDFDocument = require('pdfkit');
const { buildChart } = require('./generate-chart');
const D = require('./ziwei-data');
const { findHighlights } = require('./kyoku');
const { correctedTimeIndex } = require('./solar-time');
const { JOTEI_INTRO, joteiOutro } = require('./reader');

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 'jp');
// 明朝があれば使う（web/assets/fonts/ に .otf/.ttf があれば登録）
let SERIF = 'jp';
try {
  const fdir = path.join(__dirname, '..', 'web', 'assets', 'fonts');
  const ff = fs.readdirSync(fdir).find((f) => /\.(otf|ttf|ttc)$/i.test(f));
  if (ff) { GlobalFonts.registerFromPath(path.join(fdir, ff), 'mincho'); SERIF = 'mincho'; }
} catch (e) { /* なければゴシック */ }

const ASSETS = path.join(__dirname, '..', 'web', 'assets');
const SC = 2;                 // 2倍解像度。本文/地図はPNG(無劣化)なので2倍で十分くっきり。表紙(1054px写真)の拡大は2倍に抑える
const W = 1054 * SC, H = 1492 * SC;
const X = (p) => W * p / 100, Y = (p) => H * p / 100;

const COL = { navy: '#10264B', ink: '#26303f', soft: '#6a5a3a', gold: '#b88a3a', goldL: '#E7C77E',
  white: '#FFFDF8', ivory: '#F8F4EB', warm: '#3a2410', line: 'rgba(214,176,106,.55)' };
const BM = { 廟: ['◎', '#C99A3A'], 旺: ['◎', '#C99A3A'], 得: ['○', '#9aa0ab'], 利: ['○', '#9aa0ab'],
  平: ['◇', '#B0834A'], 不: ['△', '#B5524A'], 陷: ['△', '#B5524A'] };
const MM = { 祿: '#C99A3A', 權: '#C99A3A', 科: '#C99A3A', 忌: '#B5524A' };

// 羊皮紙の背景を「フル解像度でその場に描く」（1054pxビットマップの2倍引き伸ばし＝ガビガビを廃止）。
// グラデ＋細い金枠＋四隅飾り＋コンパス＋微細ドットを全部ベクター描画するので、どの倍率でもくっきり。
function drawParchment(x) {
  // 1) クリーム地のグラデーション
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f6efda'); g.addColorStop(0.5, '#f1e7c9'); g.addColorStop(1, '#ece0bf');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 2) ふちをほんのり落とすヴィネット
  const rg = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.72);
  rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(120,90,40,0.10)');
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  // 3) 微細なドット（紙の風合い）※JPEGノイズを避けるため控えめに
  x.save();
  for (let i = 0; i < 120; i++) {
    const rx = Math.random() * W, ry = Math.random() * H;
    x.globalAlpha = 0.03 + Math.random() * 0.04; x.fillStyle = '#b8923f';
    x.beginPath(); x.arc(rx, ry, SC * (0.3 + Math.random() * 0.4), 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // 4) 金の二重枠＋四隅の菱形飾り
  x.strokeStyle = COL.gold; x.fillStyle = COL.gold;
  const m1 = 22 * SC, m2 = 30 * SC;
  x.lineWidth = 2 * SC; x.strokeRect(m1, m1, W - 2 * m1, H - 2 * m1);
  x.lineWidth = 0.8 * SC; x.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2);
  const diamond = (cx, cy, r) => { x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill(); };
  [[m1, m1], [W - m1, m1], [m1, H - m1], [W - m1, H - m1]].forEach(([cx, cy]) => diamond(cx, cy, 5 * SC));
  // 5) コンパスローズ（右下）と八芒星（左下）：細い金線
  const rose = (cx, cy, R, points) => {
    x.save(); x.strokeStyle = 'rgba(184,138,58,0.5)'; x.fillStyle = 'rgba(184,138,58,0.5)'; x.lineWidth = 0.7 * SC;
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2; const long = i % (points / 8) === 0;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R * (long ? 1 : 0.6), cy + Math.sin(a) * R * (long ? 1 : 0.6)); x.stroke();
    }
    x.beginPath(); x.arc(cx, cy, R * 0.5, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(cx, cy, R * 0.16, 0, Math.PI * 2); x.fill();
    x.restore();
  };
  rose(W - 80 * SC, H - 78 * SC, 52 * SC, 32);
  rose(78 * SC, H - 80 * SC, 30 * SC, 16);
}

// 表紙アートを「フル解像度でその場に描く」（cover.png 1054pxの2倍引き伸ばし＝ブロックノイズを廃止）。
// 星空→朝焼け→山並みのグラデ＋中央の朝日（サンバースト）＋金枠＋王冠を全部ベクター描画。
function drawCoverArt(x) {
  // 1) 空のグラデーション（深い紺の星空→紫→朝焼けのオレンジ→足元の暗がり）
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1430'); g.addColorStop(0.26, '#1c2b56'); g.addColorStop(0.48, '#46396a');
  g.addColorStop(0.64, '#8f4d5e'); g.addColorStop(0.78, '#cc6a39'); g.addColorStop(0.9, '#f0a64d'); g.addColorStop(1, '#2a1a12');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 2) 星（上2/3に散らす）
  x.save();
  for (let i = 0; i < 360; i++) {
    const sx = Math.random() * W, sy = Math.random() * H * 0.62;
    x.globalAlpha = 0.25 + Math.random() * 0.6; x.fillStyle = Math.random() < 0.15 ? '#ffe6a8' : '#ffffff';
    x.beginPath(); x.arc(sx, sy, SC * (0.4 + Math.random() * 1.0), 0, Math.PI * 2); x.fill();
  }
  x.restore();
  const cx = W / 2, sunY = H * 0.42;
  // 3) 中央の朝日：放射する光線（サンバースト）
  x.save(); x.translate(cx, sunY);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2; const long = i % 3 === 0;
    const len = H * (long ? 0.30 : 0.20) * (0.85 + Math.random() * 0.3);
    x.strokeStyle = `rgba(247,210,130,${long ? 0.5 : 0.28})`; x.lineWidth = (long ? 1.4 : 0.8) * SC;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * len, Math.sin(a) * len); x.stroke();
  }
  // 中央から地平へ落ちる光の柱
  x.strokeStyle = 'rgba(247,220,150,0.45)'; x.lineWidth = 2 * SC;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(0, H * 0.46); x.stroke();
  x.restore();
  // 4) 朝日の輪と光球（中心の白い輝き）
  const ring = x.createRadialGradient(cx, sunY, H * 0.02, cx, sunY, H * 0.13);
  ring.addColorStop(0, 'rgba(255,255,245,0.95)'); ring.addColorStop(0.35, 'rgba(255,226,150,0.85)');
  ring.addColorStop(0.7, 'rgba(232,170,80,0.35)'); ring.addColorStop(1, 'rgba(232,170,80,0)');
  x.fillStyle = ring; x.beginPath(); x.arc(cx, sunY, H * 0.13, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(247,210,130,0.7)'; x.lineWidth = 1.5 * SC;
  x.beginPath(); x.arc(cx, sunY, H * 0.075, 0, Math.PI * 2); x.stroke();
  // 5) 地平線の輝き（足元中央から昇る光）
  const hor = x.createRadialGradient(cx, H * 0.9, H * 0.01, cx, H * 0.9, H * 0.2);
  hor.addColorStop(0, 'rgba(255,240,200,0.9)'); hor.addColorStop(0.5, 'rgba(248,180,90,0.4)'); hor.addColorStop(1, 'rgba(248,180,90,0)');
  x.fillStyle = hor; x.fillRect(0, H * 0.72, W, H * 0.28);
  // 6) 山並みのシルエット（重なり）
  const mtn = (baseY, h, col) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    x.lineTo(0, baseY);
    for (let i = 0; i <= 8; i++) { const px = (W / 8) * i; const py = baseY - (Math.sin(i * 1.7) * 0.5 + 0.5) * h; x.lineTo(px, py); }
    x.lineTo(W, H); x.closePath(); x.fill();
  };
  mtn(H * 0.9, H * 0.06, 'rgba(40,24,18,0.55)');
  mtn(H * 0.95, H * 0.05, 'rgba(24,14,10,0.85)');
  // 7) 金の二重枠＋四隅菱形＋上部の王冠
  x.strokeStyle = COL.gold; x.fillStyle = COL.gold;
  const m1 = 22 * SC, m2 = 30 * SC;
  x.lineWidth = 2 * SC; x.strokeRect(m1, m1, W - 2 * m1, H - 2 * m1);
  x.lineWidth = 0.8 * SC; x.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2);
  const diamond = (dx, dy, r) => { x.beginPath(); x.moveTo(dx, dy - r); x.lineTo(dx + r, dy); x.lineTo(dx, dy + r); x.lineTo(dx - r, dy); x.closePath(); x.fill(); };
  [[m1, m1], [W - m1, m1], [m1, H - m1], [W - m1, H - m1]].forEach(([dx, dy]) => diamond(dx, dy, 5 * SC));
  // 王冠（上辺中央）
  x.save(); x.translate(cx, m1); const cw = 26 * SC, chh = 16 * SC;
  x.fillStyle = COL.goldL; x.strokeStyle = COL.gold; x.lineWidth = 1.2 * SC;
  x.beginPath(); x.moveTo(-cw, chh * 0.4); x.lineTo(-cw, -chh * 0.2); x.lineTo(-cw * 0.45, chh * 0.35);
  x.lineTo(0, -chh); x.lineTo(cw * 0.45, chh * 0.35); x.lineTo(cw, -chh * 0.2); x.lineTo(cw, chh * 0.4); x.closePath();
  x.fill(); x.stroke();
  [-cw, 0, cw].forEach((ox) => { x.beginPath(); x.arc(ox, -chh * (ox === 0 ? 1 : 0.2), 2.4 * SC, 0, Math.PI * 2); x.fill(); });
  x.restore();
}

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
// 行末に置けない文字（開き括弧）＝行末禁則。取り残されそうなら次行へ送る。
const NO_LINE_END = '「『（【〔《〈“‘';
// 各行を {t:文字列, full:両端揃え対象か} で返す。full行は枠幅に揃える、最終行/改行/ぶら下げ行は自然な左揃え。
function wrap(x, text, maxw, font) {
  x.font = font; const out = []; let line = '';
  for (const ch of text) {
    if (ch === '\n') { out.push({ t: line, full: false }); line = ''; continue; }
    if (line && x.measureText(line + ch).width > maxw) {
      if (NO_LINE_START.includes(ch)) { line += ch; out.push({ t: line, full: false }); line = ''; } // ぶら下げ
      else {
        // 行末禁則：行末が開き括弧なら、その括弧を次行へ送って中身と離れないようにする
        let carry = '';
        while ([...line].length > 1 && NO_LINE_END.includes(line[line.length - 1])) { carry = line[line.length - 1] + carry; line = line.slice(0, -1); }
        out.push({ t: line, full: true }); line = carry + ch;
      }
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

async function renderCover(astro, name, transparent = false, titleText = null) {
  // 表紙は元画像(cover.png)の解像度そのままで描く（2倍に引き伸ばさない＝ボケ・ガビガビ無し）。
  let img = null, cw = W, ch = H;
  if (!transparent) { img = await loadImage(path.join(ASSETS, 'cover.png')); cw = img.width; ch = img.height; }
  const c = createCanvas(cw, ch); const x = c.getContext('2d');
  if (img) x.drawImage(img, 0, 0, cw, ch); // 1:1（引き伸ばし無し）
  const s = cw / 1054;                      // 文字・座標スケール（元画像1054px基準。高解像度版に差し替えても自動追従）
  const LX = (p) => cw * p / 100, LY = (p) => ch * p / 100, cx = cw / 2;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const sh = (col, b) => { x.shadowColor = col; x.shadowBlur = b * s; };
  sh('rgba(0,0,0,.5)', 8); x.fillStyle = COL.goldL; x.font = `${22 * s}px ${SERIF}`; x.fillText('紫 微 斗 数  ×  帝 王 学', cx, LY(7));
  sh('rgba(0,0,0,.55)', 16); x.fillStyle = COL.white; x.font = `bold ${84 * s}px ${SERIF}`; x.fillText(titleText || '自分のトリセツ', cx, LY(13.5));
  sh('rgba(0,0,0,.6)', 8); x.fillStyle = COL.ivory; x.font = `${22 * s}px ${SERIF}`; x.fillText('命盤からひもとく、あなたという人', cx, LY(22.5));
  if (name) { x.fillStyle = '#F1DDAE'; x.font = `bold ${27 * s}px ${SERIF}`; x.fillText(`— ${name} さま —`, cx, LY(27.5)); }
  sh('rgba(255,245,210,.6)', 12); x.fillStyle = COL.warm; x.font = `bold ${52 * s}px ${SERIF}`; x.fillText('あなたが主役。', cx, LY(60));
  sh('rgba(0,0,0,0)', 0);
  x.font = `${18 * s}px ${SERIF}`; const t = '自己理解の鑑定　／　PDFでお届け';
  const tw = x.measureText(t).width, pw = tw + 54 * s, ph = 42 * s, py = LY(69) - ph / 2, pxx = cx - pw / 2;
  x.fillStyle = 'rgba(255,253,248,.85)'; x.beginPath(); x.roundRect(pxx, py, pw, ph, 21 * s); x.fill();
  x.strokeStyle = 'rgba(16,38,75,.55)'; x.lineWidth = 1.5 * s; x.beginPath(); x.roundRect(pxx, py, pw, ph, 21 * s); x.stroke();
  x.fillStyle = COL.navy; x.fillText(t, cx, LY(69));
  // 下段（生年月日・五行局）は暗い山際に埋もれて読めないことがあるので、薄い帯を敷いてから明るい文字で描く
  x.font = `${16 * s}px ${SERIF}`;
  const bt = `${astro.solarDate} 生まれ　／　${astro.gender}　／　五行局 ${astro.fiveElementsClass}`;
  const btw = x.measureText(bt).width, bpw = btw + 44 * s, bph = 30 * s, bpy = LY(95.5) - bph / 2, bpx = cx - bpw / 2;
  x.fillStyle = 'rgba(18,12,8,.45)'; x.beginPath(); x.roundRect(bpx, bpy, bpw, bph, bph / 2); x.fill();
  sh('rgba(0,0,0,.6)', 6); x.fillStyle = COL.ivory; x.fillText(bt, cx, LY(95.5)); sh('rgba(0,0,0,0)', 0);
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
  // 命盤リーダー（チェックリスト全項目を自動で読む）に委譲。手書きブロックが無い人はこれで全項目出る。
  return require('./reader').reader(astro);
}

// 旧スロット方式（参考保持・未使用）
function bodyContentLegacy(astro) {
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

  // 主役の力（命盤まるごとをスキャンし、一番の“目玉”＝格局・美貌・際立つ星などを主役に据える）
  const { top, highlights } = findHighlights(astro);
  const kyokuBlocks = top ? [
    { type: 'h', t: `あなたの“主役の力”（${top.label}）` },
    { type: 'p', t: top.why },
  ] : [];
  const kanT = sec('官祿', 'あなたが力を発揮しやすいのは、こんな場です。', D.KAN, 'こうした場で持ち味を活かすほど、まわりからの信頼や評価につながっていきます。気負わず、得意なところから動いてみてください。');
  let fuuT = sec('夫妻', '人との関わりでは、こんな傾向があります。', D.FUU, '気持ちを溜め込まず、短くていいから言葉にしてみること。それだけで、すれ違いが減り、ご縁がぐっと深まります。');
  // 身だしなみ開運の一言は「美貌・人気の華」が本当に強い人だけ（findHighlightsの厳密判定）に限定。
  // ※桃花の補助星は誰でも数個持つので、ゆるい有無判定だと誰にでも出てしまう（伸幸に誤爆していた）。
  const hasToka = highlights.some((h) => h.key === '桃花集中');
  if (hasToka) fuuT += 'そしてあなたは、人を惹きつける“華”の星を持っています。魅力の星の人は「見られること」で運が開くタイプ。コンビニに行くひとつでも、少し身だしなみを整えて出かけるだけで、いいご縁やチャンスが自然と寄ってきます。';
  const zaiT = sec('財帛', 'お金とは、こんな付き合い方が向いています。', D.ZAI, '自分に合ったお金のリズムを知っておくと、無理なく豊かさを育てていけます。');
  const fukT = sec('福德', '心がいちばん満たされるのは、こんな時間です。', D.FUK, '忙しいときほど、この「満たされる時間」を意識して取り戻すと、あなたらしさが戻ってきます。');
  const ekiT = sec('疾厄', '体質には、こんな傾向が出やすいようです。', D.SHITSU, 'あくまで傾向で、決めつけではありません。早めに休む・あたためるなど、ちょっとした習慣が、あなたの調子を支えます。');
  const closing = 'ここに書いたのは、あなたが生まれ持った「傾向」です。当たっているところは活かし、ピンとこないところは横に置いて大丈夫。大切なのは、自分を責めずに、持ち味を活かす方へ少しずつ舵を切ること。あなたは、あなたの人生の主役です。どうか、あなたらしく歩んでいってください。';

  return [
    { type: 'h', t: 'あなたの中心にあるもの（命宮）' }, ...center.map((p) => ({ type: 'p', t: p })),
    ...cmut.map((p) => ({ type: 'p', t: p })), ...shin.map((p) => ({ type: 'p', t: p })),
    { type: 'h', t: 'あなたの強み' }, { type: 'p', t: 'あなたが自然にできること、まわりより少し得意なことを挙げると、こんな持ち味があります。' }, { type: 'ul', items: cho },
    ...kyokuBlocks,
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

async function renderBodies(astro, name, blocksOverride, transparent = false, headerOverride = null) {
  const blocks = blocksOverride || bodyContent(astro);
  const ML = 130 * SC, MR = W - 130 * SC, contentW = MR - ML;
  const TOP = 175 * SC, BOTTOM = H - 150 * SC;
  const pages = []; let x, c, y; let firstPage = true;
  const HD = headerOverride || { kicker: '自 分 の ト リ セ ツ', title: 'あなたという人', sub: name ? `${name} さま` : '' };
  const newPage = () => {
    c = createCanvas(W, H); x = c.getContext('2d'); if (!transparent) drawParchment(x);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; y = TOP;
    if (firstPage) {
      x.textAlign = 'center'; x.fillStyle = COL.gold; x.font = `${15 * SC}px ${SERIF}`;
      x.fillText(HD.kicker, W / 2, TOP - 70 * SC);
      x.fillStyle = COL.navy; x.font = `bold ${38 * SC}px ${SERIF}`; x.fillText(HD.title, W / 2, TOP - 28 * SC);
      if (HD.sub) { x.fillStyle = COL.soft; x.font = `${18 * SC}px ${SERIF}`; x.fillText(HD.sub, W / 2, TOP + 6 * SC); }
      x.textAlign = 'left'; y = TOP + 40 * SC; firstPage = false;
    }
    pages.push(c);
  };
  newPage();
  const ensure = (need) => { if (y + need > BOTTOM) newPage(); };
  for (const b of blocks) {
    if (b.type === 'pagebreak') { newPage(); continue; }
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
      const lh = 40 * SC; const indent = 30 * SC; const itemFont = `${22 * SC}px ${SERIF}`;
      for (const it of b.items) {
        // 長い項目は枠内で折り返す。◆は1行目だけ、2行目以降はテキスト開始位置(ML+indent)にぶら下げ。
        const lines = wrap(x, it, contentW - indent, itemFont);
        lines.forEach((L, li) => {
          ensure(lh);
          if (li === 0) { x.fillStyle = COL.gold; x.font = `${14 * SC}px ${SERIF}`; x.fillText('◆', ML, y - 5 * SC); }
          x.fillStyle = COL.ink; x.font = itemFont; drawLine(x, L, ML + indent, y, contentW - indent); y += lh;
        });
      }
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
  if (!transparent) drawParchment(x);
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
  const cms = minorSegs('命宮');
  // ◆は外周の円と同じく「円の頂点（上の縁の外）」に乗せる。中身は円の中にバランスよく置く。
  x.fillStyle = GOLD; x.font = `${15 * SC}px ${SERIF}`; x.fillText('◆', cx, cy - discR * 0.64 - 13 * SC);
  x.fillStyle = COL.navy; x.font = `bold ${44 * SC}px ${SERIF}`; x.fillText('帝', cx, cy - discR * 0.16);
  x.fillStyle = COL.soft; x.font = `${13 * SC}px ${SERIF}`; x.fillText('＝ あなた（命宮）', cx, cy + discR * 0.12);
  drawSegsCentered(x, cx, cy + discR * 0.31, starSegs(cr.stars, cr.b), `${14 * SC}px ${SERIF}`, discR * 1.2, 18 * SC);
  if (cms.length) drawSegsCentered(x, cx, cy + discR * 0.48, cms, `${12 * SC}px ${SERIF}`, discR * 1.2, 15 * SC);
  // 凡例
  x.fillStyle = COL.soft; x.font = `${9 * SC}px ${SERIF}`;
  x.fillText('臣下＝主星　◎強 ○中 ◇並 △課題　／　(祿)(權)(科)(忌)＝四化　／　借＝向かいの宮から', cx, H * 0.95);
  return c;
}

// 女帝モードの「手紙」ページ：羊皮紙に、大きめの文字を上下中央でドーンと配置（招待状・女帝より）。
function renderJoteiLetter({ kicker, title, sub, paras }) {
  const c = createCanvas(W, H); const x = c.getContext('2d'); drawParchment(x);
  const ML = 160 * SC, cw = W - 2 * ML;
  const bodyFont = `${30 * SC}px ${SERIF}`, lh = 60 * SC, paraGap = 34 * SC;
  const wrapped = paras.map((p) => wrap(x, p, cw, bodyFont));
  let bodyH = 0; wrapped.forEach((lines) => { bodyH += lines.length * lh + paraGap; });
  const titleH = (kicker ? 54 * SC : 0) + 74 * SC + (sub ? 50 * SC : 0) + 40 * SC;
  let y = Math.max(220 * SC, (H - (titleH + bodyH)) / 2); // 上下中央（最低マージン確保）
  x.textAlign = 'center';
  if (kicker) { x.fillStyle = COL.gold; x.font = `${16 * SC}px ${SERIF}`; x.fillText(kicker, W / 2, y); y += 54 * SC; }
  x.fillStyle = COL.navy; x.font = `bold ${54 * SC}px ${SERIF}`; x.fillText(title, W / 2, y); y += 74 * SC;
  if (sub) { x.fillStyle = COL.soft; x.font = `${20 * SC}px ${SERIF}`; x.fillText(sub, W / 2, y); y += 50 * SC; }
  // 区切りの細い金線
  y += 14 * SC; x.strokeStyle = COL.line; x.lineWidth = 1 * SC; x.beginPath(); x.moveTo(W / 2 - 70 * SC, y); x.lineTo(W / 2 + 70 * SC, y); x.stroke(); y += 50 * SC;
  x.fillStyle = COL.ink; x.font = bodyFont;
  for (const lines of wrapped) { for (const L of lines) { x.fillText(L.t, W / 2, y); y += lh; } y += paraGap; }
  return c;
}

async function buildPDF(astro, name, outPath, blocksOverride, headerOverride = null, jotei = false) {
  // 各ページは「背景＋文字」を1枚のキャンバスに合成（透明レイヤーは使わない＝どのビューアでも確実に表示）
  const cover = await renderCover(astro, name, false, jotei ? '帝の書' : null);
  const court = await renderCourtDrawn(astro);                    // 背景=羊皮紙＋円もコード描画（ズレ無し・12宮）
  let pages;
  if (jotei) {
    // 招待状（中央ドーン）→ 通常本文 → 女帝より（中央ドーン）
    const invite = renderJoteiLetter({ kicker: '女帝からの招待状', title: '帝の書', sub: name ? `${name} へ` : '', paras: JOTEI_INTRO.map((b) => b.t) });
    const bodies = await renderBodies(astro, name);
    const outroBlocks = joteiOutro(astro);
    const outro = renderJoteiLetter({ kicker: '', title: '女帝より', sub: '', paras: outroBlocks.filter((b) => b.type === 'p').map((b) => b.t) });
    pages = [cover, court, invite, ...bodies, outro];
  } else {
    const bodies = await renderBodies(astro, name, blocksOverride, false, headerOverride);
    pages = [cover, court, ...bodies];
  }
  const A4 = { width: 595.28, height: 841.89 };
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath); doc.pipe(stream);
  pages.forEach((c, i) => {
    if (i) doc.addPage({ size: 'A4', margin: 0 });
    // 全ページPNG(無劣化)。表紙はJPEGだと夜空にブロックノイズ(ガビガビ)が出るためPNGに統一。
    // ※残るソフトさは元画像cover.pngが1054pxのため。根治には高解像度の元画像が必要。
    doc.image(c.toBuffer('image/png'), 0, 0, A4);
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

// 直接実行されたときだけ自動生成する。require時には動かさない（手書き版PDFを上書きしないため）。
if (require.main === module) (async () => {
  let a = process.argv.slice(2);
  const jotei = a.includes('--jotei') || a.includes('女帝'); // 女帝モード（帝の書）
  a = a.filter((x) => x !== '--jotei' && x !== '女帝');
  const outDir = path.join(__dirname, '..', 'web', 'pdf');
  const isClock = a[1] && /^\d{1,2}:\d{2}$/.test(a[1]);
  if (isClock) {
    // 新形式: <陽暦> <HH:MM> <都道府県> <性別> [名前]　…真太陽時(経度時差+均時差)で時刻indexを自動補正
    const [solar, hhmm, pref, gender, name] = a;
    if (!pref || !gender) { console.error('使い方: node src/build-pdf.js <陽暦YYYY-M-D> <HH:MM> <都道府県> <性別 男|女> [名前] [--jotei]'); process.exit(1); }
    const r = correctedTimeIndex(solar, hhmm, pref);
    console.log(`真太陽時補正: JST ${r.detail.jst}（${r.detail.地点 || pref}・${r.detail.精度}/${r.detail.lon}°）→ 真太陽時 ${r.trueSolar} → 時刻index ${r.index}（経度時差${r.detail.経度時差分}分＋均時差${r.detail.均時差分}分）`);
    const astro = buildChart(solar, r.index, gender);
    const fname = `${jotei ? '帝の書' : '自分のトリセツ'}_${name || solar}.pdf`;
    await buildPDF(astro, name || '', path.join(outDir, fname), undefined, null, jotei);
    console.log('PDF出力:', (jotei ? '【帝の書】' : '') + (name || solar));
  } else if (a.length >= 3) {
    // 旧形式（互換）: <陽暦> <時刻index 0-12> <性別> [名前]
    const astro = buildChart(a[0], Number(a[1]), a[2]);
    await buildPDF(astro, a[3] || '', path.join(outDir, `自分のトリセツ_${a[3] || a[0]}.pdf`));
    console.log('PDF出力:', a[3] || a[0]);
  } else {
    for (const m of FAMILY) {
      const astro = buildChart(m.solar, m.time, m.gender);
      const p = await buildPDF(astro, m.name, path.join(outDir, `自分のトリセツ_${m.name}.pdf`));
      console.log('PDF出力:', m.name, Math.round(fs.statSync(p).size / 1024) + 'KB');
    }
  }
})();

module.exports = { buildPDF, renderCover, renderCourt, renderCourtDrawn, renderBodies, renderJoteiLetter };

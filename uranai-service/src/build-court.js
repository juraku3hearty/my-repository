// 朝廷図ビルダー（帝王学テーマの命盤ビジュアル）
// 命宮＝帝（本人）を中央の玉座に、十二宮を朝廷の役職、主星を臣下として1枚に描く。
// しびとくんの表は参照しない。iztro の命盤データ（astro）からゼロから組む。
//
// 使い方:
//   node src/build-court.js                            # サンプル(1983-1-8/女/寅)で単体PDF出力
//   const { buildCourt } = require('./build-court');    # 単体PDF
//   const { renderCourt } = require('./build-court');   # 既存docに1ページとして描く（トリセツに綴じ込む用）

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { buildChart } = require('./generate-chart');

const JP_FONT = '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf';

// 温かい配色（金・生成り・墨）＋和の差し色は控えめに（朱を細く一筋だけ）
const C = {
  ink: '#3a3330',
  sub: '#8a7f76',
  role: '#9c6b3f',
  throneInk: '#7a4f1e',
  gold: '#c79a4e',
  vermilion: '#a14a3a', // 和の差し色（ごく控えめ）
  cardBg: '#f5efe6',
  throneBg: '#f8edd7',
  line: '#e3d8c4',
  spoke: '#e8dcc4',
};

// 十二宮 → 朝廷の役職（iztro の宮名をキーにする）
// meaning＝平易な意味（カードの主役・大）／ role＝帝王学の役職（脇役・括弧で小さく）
const COURT = {
  命宮: { role: '帝', meaning: 'あなた自身' },
  父母: { role: '師父', meaning: '親・目上' },
  福德: { role: '御心', meaning: '心・楽しみ' },
  田宅: { role: '城', meaning: '家・資産' },
  官祿: { role: '朝廷', meaning: '仕事・役職' },
  僕役: { role: '家臣', meaning: '友・部下' },
  遷移: { role: '遠つ国', meaning: '外の世界' },
  疾厄: { role: '御典医', meaning: '健康・体' },
  財帛: { role: '国庫', meaning: '金運・財' },
  子女: { role: '世継ぎ', meaning: '子・後進' },
  夫妻: { role: '后', meaning: '伴侶・恋愛' },
  兄弟: { role: '義兄弟', meaning: '兄弟・仲間' },
};

// 對宮（空宮のとき星を借りる相手）
const OPP = {
  命宮: '遷移', 遷移: '命宮', 兄弟: '僕役', 僕役: '兄弟',
  夫妻: '官祿', 官祿: '夫妻', 子女: '田宅', 田宅: '子女',
  財帛: '福德', 福德: '財帛', 疾厄: '父母', 父母: '疾厄',
};

const BRIGHT = { 廟: '◎', 旺: '◎', 得: '○', 利: '○', 平: '◇', 不: '△', 陷: '△' };

function starLabel(s) {
  let t = s.name + (BRIGHT[s.brightness] || '');
  if (s.mutagen) t += `(${s.mutagen})`;
  return t;
}

// 宮の主星テキスト（空宮なら對宮から借りて「借」を付ける）
function retainersText(palMap, name) {
  const p = palMap[name];
  if (p && p.majorStars && p.majorStars.length) {
    return p.majorStars.map(starLabel).join('　');
  }
  const opp = palMap[OPP[name]];
  if (opp && opp.majorStars && opp.majorStars.length) {
    return '（不在）借　' + opp.majorStars.map(starLabel).join('　');
  }
  return '（臣下なし）';
}

// 既存の doc に「朝廷図」を1ページぶん描く（addPage / end はしない）
function renderCourt(doc, astro, opts = {}) {
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;

  const palMap = {};
  astro.palaces.forEach((p) => { palMap[p.name] = p; });

  // 上下の金帯
  doc.save().rect(0, 0, doc.page.width, 8).fill(C.gold).restore();
  doc.save().rect(0, pageH - 8, doc.page.width, 8).fill(C.gold).restore();

  // 見出し
  doc.fillColor(C.throneInk).fontSize(22).text(opts.title || 'あなたの朝廷図', L, 54, { width: pageW, align: 'center' });
  doc.fillColor(C.sub).fontSize(10)
    .text(opts.subtitle || '紫微斗数 × 帝王学　― 命宮を帝とし、十二宮を朝廷として ―', L, 84, { width: pageW, align: 'center' });
  // 和の差し色（細い朱の一筋）
  const cxTitle = L + pageW / 2;
  doc.save().lineWidth(1.4).strokeColor(C.vermilion)
    .moveTo(cxTitle - 26, 104).lineTo(cxTitle + 26, 104).stroke().restore();

  // 4×4 グリッド（中央2×2＝玉座、周囲12マスに11宮＋凡例）
  const gridTop = 116;
  const gridBottom = pageH - 78;
  const cellW = pageW / 4;
  const cellH = (gridBottom - gridTop) / 4;
  const cellX = (c) => L + c * cellW;
  const cellY = (r) => gridTop + r * cellH;
  const cx = L + pageW / 2;
  const cy = gridTop + (gridBottom - gridTop) / 2;

  // 役職カードを置く座席（時計回り：上→右→下→左）と対応する宮名
  const seats = [
    { r: 0, c: 0, name: '官祿' },
    { r: 0, c: 1, name: '夫妻' },
    { r: 0, c: 2, name: '父母' },
    { r: 0, c: 3, name: '財帛' },
    { r: 1, c: 3, name: '田宅' },
    { r: 2, c: 3, name: '子女' },
    { r: 3, c: 3, name: '兄弟' },
    { r: 3, c: 2, name: '僕役' },
    { r: 3, c: 1, name: '疾厄' },
    { r: 3, c: 0, name: '遷移' },
    { r: 2, c: 0, name: '福德' },
    { r: 1, c: 0, name: '__legend__' },
  ];

  // 玉座へのスポーク（背面に薄く）
  doc.save().lineWidth(1).strokeColor(C.spoke);
  seats.forEach((s) => {
    if (s.name === '__legend__') return;
    const scx = cellX(s.c) + cellW / 2;
    const scy = cellY(s.r) + cellH / 2;
    doc.moveTo(cx, cy).lineTo(scx, scy).stroke();
  });
  doc.restore();

  function card(r, c, name) {
    const pad = 6;
    const x = cellX(c) + pad;
    const y = cellY(r) + pad;
    const w = cellW - pad * 2;
    const h = cellH - pad * 2;
    doc.save().roundedRect(x, y, w, h, 8).fill(C.cardBg).restore();
    doc.save().lineWidth(0.8).strokeColor(C.line).roundedRect(x, y, w, h, 8).stroke().restore();

    const info = COURT[name];
    let ty = y + 9;
    // 主役＝平易な意味（大）＋ 脇役＝役職を括弧で小さく
    doc.fillColor(C.throneInk).fontSize(12).text(info.meaning, x + 4, ty, { width: w - 8, align: 'center' });
    ty += 17;
    doc.fillColor(C.role).fontSize(8.5).text('（' + info.role + '）', x + 4, ty, { width: w - 8, align: 'center' });
    ty += 12;
    doc.fillColor(C.sub).fontSize(7).text(name + '宮', x + 4, ty, { width: w - 8, align: 'center' });
    ty += 11;
    doc.strokeColor(C.line).lineWidth(0.5).moveTo(x + 10, ty).lineTo(x + w - 10, ty).stroke();
    ty += 5;
    doc.fillColor(C.ink).fontSize(9.5).text(retainersText(palMap, name), x + 5, ty, { width: w - 10, align: 'center', lineGap: 1 });
  }

  function legend(r, c) {
    const pad = 6;
    const x = cellX(c) + pad;
    const y = cellY(r) + pad;
    const w = cellW - pad * 2;
    const h = cellH - pad * 2;
    doc.save().roundedRect(x, y, w, h, 8).fill('#efe7d8').restore();
    doc.save().lineWidth(0.8).strokeColor(C.line).roundedRect(x, y, w, h, 8).stroke().restore();
    let ty = y + 9;
    doc.fillColor(C.throneInk).fontSize(10).text('凡例', x + 4, ty, { width: w - 8, align: 'center' });
    ty += 16;
    doc.fillColor(C.ink).fontSize(8).text(
      '臣下＝主星\n◎ 強い  ○ 中  ◇ 並  △ 課題\n(祿)(權)(科)(忌)＝四化\n借＝向かいの宮から拝借',
      x + 6, ty, { width: w - 12, align: 'left', lineGap: 2 });
  }

  seats.forEach((s) => {
    if (s.name === '__legend__') legend(s.r, s.c);
    else card(s.r, s.c, s.name);
  });

  // 中央の玉座（2×2）
  const tx = cellX(1);
  const ty0 = cellY(1);
  const tw = cellW * 2;
  const th = cellH * 2;
  doc.save().roundedRect(tx + 6, ty0 + 6, tw - 12, th - 12, 12).fill(C.throneBg).restore();
  doc.save().lineWidth(1.6).strokeColor(C.gold).roundedRect(tx + 6, ty0 + 6, tw - 12, th - 12, 12).stroke().restore();

  let yy = ty0 + 20;
  doc.fillColor(C.gold).fontSize(16).text('◆', tx, yy, { width: tw, align: 'center' });
  yy += 24;
  doc.fillColor(C.throneInk).fontSize(38).text('帝', tx, yy, { width: tw, align: 'center' });
  yy += 50;
  doc.fillColor(C.ink).fontSize(12).text('― あなた（命宮）―', tx, yy, { width: tw, align: 'center' });
  yy += 22;
  doc.fillColor(C.role).fontSize(10).text('玉座の臣下', tx, yy, { width: tw, align: 'center' });
  yy += 14;
  doc.fillColor(C.ink).fontSize(12).text(retainersText(palMap, '命宮'), tx + 10, yy, { width: tw - 20, align: 'center', lineGap: 2 });
  yy += 34;
  const meta = [];
  if (astro.fiveElementsClass) meta.push('五行局：' + astro.fiveElementsClass);
  const bodyPalace = astro.palaces.find((p) => p.isBodyPalace);
  if (bodyPalace) meta.push('身宮：' + bodyPalace.name + '宮');
  doc.fillColor(C.sub).fontSize(9).text(meta.join('　／　'), tx + 8, yy, { width: tw - 16, align: 'center' });

  // 脚注（下マージン内に収めて改ページを防ぐ）
  doc.fillColor(C.sub).fontSize(7)
    .text('※ 命宮＝あなた（帝）。星のない宮は向かいの宮から星を借りて「借」と記します。命盤計算：iztro。',
      L, pageH - 64, { width: pageW, align: 'center' });
}

// 単体PDFとして出力
function buildCourt(astro, outPath, opts = {}) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  doc.registerFont('jp', JP_FONT);
  doc.font('jp');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  renderCourt(doc, astro, opts);
  doc.end();
  return new Promise((res) => stream.on('finish', () => res(outPath)));
}

if (require.main === module) {
  const astro = buildChart('1983-1-8', 2, '女');
  const out = path.join(__dirname, '..', 'samples', 'お手本_朝廷図.pdf');
  buildCourt(astro, out, {
    title: 'あなたの朝廷図',
    subtitle: '紫微斗数 × 帝王学　― 命宮を帝とし、十二宮を朝廷として ―',
  }).then((p) => console.log('朝廷図を出力しました: ' + p));
}

module.exports = { buildCourt, renderCourt, COURT };

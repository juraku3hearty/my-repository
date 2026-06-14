// 自分のトリセツ鑑定 PDF ビルダー（Phase 0 お手本）
// 役割：命盤データ＋「基準書」を根拠にした鑑定文を受け取り、PDF に組む。
//
// 重要（SPEC §0・§5）:
//  - 解釈の文章は呼び出し側が用意する。本ファイルは「組版」だけを担当する。
//  - 文章の根拠は基準書のみ。基準書に無い星（輔星・雑曜など）は扱わない。
//  - 煽らない・大げさに言わない・人を勝手にプロファイルしない。
//
// 使い方:
//   node src/build-report.js              # 同梱のお手本データで samples/お手本_自分のトリセツ.pdf を出力
//   const { buildReport } = require('./build-report'); buildReport(report, outPath);

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const JP_FONT = '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf';

// 配色（落ち着いた・煽らないトーン）
const COL = {
  ink: '#2b2b35',
  sub: '#6b6b7a',
  accent: '#5b4b8a', // 紫微の"紫"
  line: '#d9d6e6',
  boxbg: '#f4f2fa',
};

function buildReport(report, outPath) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  doc.registerFont('jp', JP_FONT);
  doc.font('jp');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;

  // ── 表紙（任意）
  function cover(rep) {
    const pageH = doc.page.height;
    const cx = L + pageW / 2;
    // 上下にそっと帯を引く（落ち着いた装飾）
    doc.save().rect(0, 0, doc.page.width, 8).fill(COL.accent).restore();
    doc.save().rect(0, doc.page.height - 8, doc.page.width, 8).fill(COL.accent).restore();

    let y = pageH * 0.30;
    doc.fillColor(COL.sub).fontSize(12)
      .text(rep.coverLabel || '紫微斗数 ― 自分のトリセツ鑑定', L, y, { width: pageW, align: 'center' });
    y += 34;
    doc.fillColor(COL.accent).fontSize(34)
      .text(rep.title, L, y, { width: pageW, align: 'center' });
    y += 56;
    doc.fillColor(COL.ink).fontSize(13)
      .text(rep.coverSubtitle || '命盤からひもとく、あなたの持ち味', L, y, { width: pageW, align: 'center' });
    y += 40;
    // 中央の細い罫＋ひし形
    doc.strokeColor(COL.line).lineWidth(1)
      .moveTo(cx - pageW * 0.18, y).lineTo(cx + pageW * 0.18, y).stroke();
    doc.fillColor(COL.accent).fontSize(10)
      .text('◆', L, y - 6, { width: pageW, align: 'center' });
    y += 26;
    if (rep.coverRecipient) {
      doc.fillColor(COL.ink).fontSize(12)
        .text(rep.coverRecipient, L, y, { width: pageW, align: 'center' });
      y += 22;
    }
    if (rep.coverDate) {
      doc.fillColor(COL.sub).fontSize(10.5)
        .text('鑑定日　' + rep.coverDate, L, y, { width: pageW, align: 'center' });
    }
    // 下部のサービス名
    doc.fillColor(COL.sub).fontSize(10)
      .text(rep.brand || '紫微斗数 鑑定', L, doc.page.height - 80, { width: pageW, align: 'center' });
  }

  if (report.cover) {
    cover(report);
    doc.addPage().font('jp');
  }

  // ── 見出し（大）※表紙がある場合は本文ページに大見出しを重ねない
  if (!report.cover) {
    doc.fillColor(COL.accent).fontSize(22).text(report.title, { align: 'left' });
    doc.moveDown(0.2);
    doc.fillColor(COL.sub).fontSize(11).text(report.subtitle);
    doc.moveDown(0.4);
    doc.strokeColor(COL.accent).lineWidth(2)
      .moveTo(L, doc.y).lineTo(L + pageW, doc.y).stroke();
    doc.moveDown(0.8);
  }

  // ── 基本情報ボックス
  const boxTop = doc.y;
  const lines = report.facts;
  doc.fontSize(10.5).fillColor(COL.ink);
  const boxH = lines.length * 16 + 20;
  doc.save().rect(L, boxTop, pageW, boxH).fill(COL.boxbg).restore();
  doc.fillColor(COL.ink);
  let fy = boxTop + 10;
  lines.forEach((ln) => {
    doc.fontSize(10.5).fillColor(COL.sub).text(ln.k, L + 14, fy, { continued: true, width: pageW - 28 });
    doc.fillColor(COL.ink).text('  ' + ln.v);
    fy += 16;
  });
  doc.y = boxTop + boxH + 18;

  // ── セクション描画ヘルパ
  function section(heading, paragraphs) {
    if (doc.y > doc.page.height - 160) doc.addPage().font('jp');
    doc.fillColor(COL.accent).fontSize(14).text(heading);
    doc.moveDown(0.2);
    doc.strokeColor(COL.line).lineWidth(1)
      .moveTo(L, doc.y).lineTo(L + pageW, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fillColor(COL.ink).fontSize(11);
    paragraphs.forEach((p) => {
      doc.text(p, { align: 'left', lineGap: 4 });
      doc.moveDown(0.6);
    });
    doc.moveDown(0.5);
  }

  report.sections.forEach((s) => section(s.heading, s.paragraphs));

  // ── フッター（倫理注記・出典）
  if (doc.y > doc.page.height - 150) doc.addPage().font('jp');
  doc.moveDown(0.5);
  doc.strokeColor(COL.line).lineWidth(1)
    .moveTo(L, doc.y).lineTo(L + pageW, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fillColor(COL.sub).fontSize(8.5);
  report.footnotes.forEach((f) => { doc.text(f, { lineGap: 2 }); doc.moveDown(0.2); });

  doc.end();
  return new Promise((res) => stream.on('finish', () => res(outPath)));
}

// ───────────────────────────────────────────────
// 同梱お手本データ（オーナー本人：1983-1-8 / 女性 / 寅時）
// すべて基準書 v0（たたき台）を根拠にした文章。命宮・夫妻宮は空宮のため對宮の主星を借りて読む。
// 命宮の輔星(陀羅)・雑曜(華蓋ほか)は基準書に項目がないため扱わない（SPEC §0）。
const SAMPLE = {
  title: '自分のトリセツ',
  subtitle: 'お手本サンプル ／ 自分のトリセツ（自己理解）',
  // 表紙
  cover: true,
  coverLabel: '紫微斗数 × 帝王学',
  coverSubtitle: 'あなたという人をひもとく、自己理解の鑑定',
  coverRecipient: '1983年1月8日 生まれ　／　女性',
  coverDate: '2026年6月14日',
  brand: '紫微斗数 × 帝王学 ｜ トリセツ鑑定',
  facts: [
    { k: '生年月日', v: '1983年1月8日　4時13分ごろ（寅の刻）' },
    { k: '性別', v: '女性' },
    { k: '五行局', v: '金の四局' },
    { k: '命宮', v: '空宮（向かいの星を借りて読みます）→ 天機・天梁（化祿）' },
    { k: '身宮', v: '官禄宮（仕事・社会的役割に重心）／ 太陽・巨門' },
  ],
  sections: [
    {
      heading: 'はじめに',
      paragraphs: [
        'この鑑定は、生まれた瞬間の星の配置（命盤）をもとに、あなたの「もともとの持ち味」をお伝えするものです。星はあなたを決めつけるものではなく、追い風と向かい風の方向を示す地図のようなもの。当たっていると感じるところは活かし、ピンとこないところは「そういう見方もあるのか」と受け取ってください。',
      ],
    },
    {
      heading: 'あなたの中心にあるもの（命宮）',
      paragraphs: [
        'あなたの命宮には、主役の星がない「空宮」でした。紫微斗数では、このとき向かいの宮の星を借りて人物像を読みます。あなたが借りるのは「天機」と「天梁」。よく気がついて、よく考える人です。',
        '先のことまで頭が回るぶん、まだ起こってもないことまで心配して、動く前に立ち止まってしまうことがあるかもしれません。でも、本当に「こんなんで動いていいのかな」と思うくらいの段階で一歩出てみたほうが、案外そこから進み始めます。',
        'そしてあなたには、困っている人を放っておけない、深い面倒見があります。その誠実さや世話好きは、ただの自己犠牲で終わりません。尽くした分が、人とのご縁やチャンスになって返ってくる——これが、あなたの命盤に表れたいちばんの巡り合わせです（天梁の化祿）。',
      ],
    },
    {
      heading: 'あなたの強み',
      paragraphs: [
        '・先を読んで段取りを組める、機転と分析の力（天機）',
        '・人の気持ちに気づき、困っている人を支えられる面倒見（天機・天梁）',
        '・筋を通す誠実さと、芯の通った正しさ（天梁）',
        '・尽くした分が「ご縁」になって返ってくる巡り合わせ（天梁・化祿）',
      ],
    },
    {
      heading: '少し気をつけたいところ',
      paragraphs: [
        'これは欠点ではなく、強みが少し行きすぎたときに出るクセです。知っておくと、扱いやすくなります。',
        '・考えすぎて足が止まったり、心配が先に立つことがあります。完璧に見通せてからでなくて大丈夫。「まだ早いかな」で一歩、がちょうどいいくらいです（天機）。',
        '・人の世話を焼くうち、よかれと思った言葉が「説教」に聞こえてしまうことも。助けるのはやめなくていい。ひと言かける前に、ひと呼吸だけ「今この人は求めてるかな」と置くと、あなたの優しさはまっすぐ届きます（天梁）。',
      ],
    },
    {
      heading: '仕事・社会での活かし方（官禄宮・身宮）',
      paragraphs: [
        'あなたは「身宮」が仕事の宮（官禄宮）に重なっています。仕事や社会での役割が、人生の重心になりやすい人、ということです。',
        'その官禄宮には「太陽」と「巨門」が、どちらも強い状態で入っています。太陽は人を明るく照らし、公正にふるまう星。巨門は言葉と専門性の星です。人前に立って、言葉と知識で人を照らす——教育、発信、相談、専門職のような仕事で、あなたはいちばん輝きます。まわりの助けが、そのまま評価や信頼につながる巡り合わせ（左輔の化科）も添えられています。',
      ],
    },
    {
      heading: '恋愛・パートナーシップ（夫妻宮）',
      paragraphs: [
        '夫妻宮も空宮なので、向かいの官禄宮から「太陽」と「巨門」を借りて読みます。',
        'あなたは、相手に明るく接し、よく尽くす、あたたかな恋愛をする人。そして、言葉が縁になるタイプです。本音をていねいに言葉にして語り合えると、関係はぐっと深まります。逆に、言わないままだと、ちょっとした行き違いから誤解が生まれやすい面も。',
        '気持ちを溜め込まず、短くていいから言葉にしてみる。それが、あなたのパートナーシップのいちばんの鍵になります。',
      ],
    },
    {
      heading: 'おわりに',
      paragraphs: [
        'あなたは「よく考え、よく気づき、人を支える」人。その誠実さが、ちゃんとご縁になって返ってくる巡り合わせを持っています。仕事や社会の場で、言葉と知恵を使って人を照らすとき、いちばんあなたらしくいられます。考えすぎて足が止まりそうなときは、「まだ早いかな」のところで、まず一歩。その一歩が、次のいいご縁を運んできます。',
      ],
    },
  ],
  footnotes: [
    '※ 本鑑定は紫微斗数の命盤にもとづく「持ち味の傾向」をお伝えするものです。未来を断定したり、優劣を決めたりするものではありません。',
    '※ 解釈は本サービスの「基準書」のみを根拠にしています。基準書に項目のない星（命宮の輔星・雑曜など）は、今回は扱っていません。',
    '※ 命宮・夫妻宮が空宮のため、紫微斗数の定石にしたがい向かいの宮の主星を借りて読みました。命盤計算：iztro。',
  ],
};

if (require.main === module) {
  const out = path.join(__dirname, '..', 'samples', 'お手本_自分のトリセツ.pdf');
  buildReport(SAMPLE, out).then((p) => console.log('PDF を出力しました: ' + p));
}

module.exports = { buildReport, SAMPLE };

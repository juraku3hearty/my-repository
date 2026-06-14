// 命盤生成スクリプト（Phase 0）
// 役割：誕生日・時刻・性別から、紫微斗数の命盤を計算し
//       (1) 機械処理用の JSON  (2) 人が読める日本語サマリ  を出す。
// 解釈はここではしない。解釈は「基準書」を根拠に別工程で行う（SPEC §0）。
//
// 使い方:
//   node src/generate-chart.js <陽暦YYYY-M-D> <時刻index 0-12> <性別 男|女> [--json]
//   例: node src/generate-chart.js 1990-5-20 7 女
//
// 時刻index（時辰）の対応:
//   0=23:00-01:00(早子) 1=01-03 2=03-05 3=05-07 4=07-09 5=09-11
//   6=11-13(午) 7=13-15 8=15-17 9=17-19 10=19-21 11=21-23 12=23:00-01:00(晩子)
//   ※生まれ時間が分からない場合の「時刻推定」は Phase 3 の商品で扱う（SPEC §6）。

const { astro } = require('iztro');

// 時刻index → 人が読める時間帯ラベル（命盤生成のためだけ。客には見せない＝SPEC §6 倫理）
const TIME_LABELS = [
  '23:00-01:00（早子）', '01:00-03:00', '03:00-05:00', '05:00-07:00',
  '07:00-09:00', '09:00-11:00', '11:00-13:00（午）', '13:00-15:00',
  '15:00-17:00', '17:00-19:00', '19:00-21:00', '21:00-23:00',
  '23:00-01:00（晩子）',
];

function buildChart(solarDate, timeIndex, gender) {
  // iztro: bySolar(陽暦, 時刻index, 性別, うるう月補正, 言語)
  return astro.bySolar(solarDate, timeIndex, gender, true, 'ja-JP');
}

// 星を「名前[明るさ]+四化」の読みやすい文字列にする
function starToText(s) {
  let t = s.name;
  if (s.brightness) t += `[${s.brightness}]`;
  if (s.mutagen) t += `(化${s.mutagen})`;
  return t;
}

function toReadable(a, timeIndex) {
  const lines = [];
  lines.push('════════════════════════════════════════');
  lines.push('  紫微斗数 命盤');
  lines.push('════════════════════════════════════════');
  lines.push(`陽暦   : ${a.solarDate}  ${TIME_LABELS[timeIndex] || ''}`);
  lines.push(`陰暦   : ${a.lunarDate}`);
  lines.push(`干支   : ${a.chineseDate}`);
  lines.push(`性別   : ${a.gender}`);
  lines.push(`星座   : ${a.sign}   十二支: ${a.zodiac}`);
  lines.push(`命主   : ${a.soul}   身主: ${a.body}`);
  lines.push(`五行局 : ${a.fiveElementsClass}`);
  lines.push('');
  lines.push('──── 十二宮 ────');
  a.palaces.forEach((p) => {
    const tags = [];
    if (p.name === '命宮') tags.push('★命宮');
    if (p.isBodyPalace) tags.push('身宮');
    const head = `【${p.name}】${tags.length ? ' ' + tags.join('/') : ''}  干支:${p.heavenlyStem}${p.earthlyBranch}  大限:${p.decadal && p.decadal.range ? p.decadal.range.join('-') : ''}`;
    lines.push(head);
    const majors = p.majorStars.map(starToText).join('、');
    const minors = p.minorStars.map(starToText).join('、');
    const adj = p.adjectiveStars.map((s) => s.name).join('、');
    lines.push(`  主星: ${majors || '（なし＝空宮）'}`);
    lines.push(`  輔星: ${minors || '（なし）'}`);
    lines.push(`  雑曜: ${adj || '（なし）'}`);
  });
  lines.push('════════════════════════════════════════');
  return lines.join('\n');
}

function main() {
  const [solarDate, timeIndexRaw, gender, flag] = process.argv.slice(2);
  if (!solarDate || timeIndexRaw === undefined || !gender) {
    console.error('使い方: node src/generate-chart.js <陽暦YYYY-M-D> <時刻index 0-12> <性別 男|女> [--json]');
    console.error('例    : node src/generate-chart.js 1990-5-20 7 女');
    process.exit(1);
  }
  const timeIndex = Number(timeIndexRaw);
  const a = buildChart(solarDate, timeIndex, gender);

  if (flag === '--json') {
    console.log(JSON.stringify(a, null, 2));
  } else {
    console.log(toReadable(a, timeIndex));
  }
}

if (require.main === module) main();

module.exports = { buildChart, toReadable, starToText, TIME_LABELS };

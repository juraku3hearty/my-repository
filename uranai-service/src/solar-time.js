// 真太陽時（地方真太陽時）への補正。紫微斗数の時辰は「その土地の本当の太陽の位置」で決めるので、
// JSTの時計時刻そのままだと東日本/西日本でズレる。とくに時辰(2時間枠)の境目では命盤が別物になる。
//   補正 = 経度時差((経度-135)×4分) ＋ 均時差(日付による太陽のズレ)
//   true_solar = JST + 経度時差 + 均時差  → その時刻が入る時辰indexを返す。

// 都道府県（県庁所在地）の経度。明石135°Eが日本標準時の基準。
const PREF_LON = {
  北海道: 141.35, 青森: 140.74, 岩手: 141.15, 宮城: 140.87, 秋田: 140.10, 山形: 140.36, 福島: 140.47,
  茨城: 140.45, 栃木: 139.88, 群馬: 139.06, 埼玉: 139.65, 千葉: 140.12, 東京: 139.69, 神奈川: 139.64,
  新潟: 139.02, 富山: 137.21, 石川: 136.63, 福井: 136.22, 山梨: 138.57, 長野: 138.18, 岐阜: 136.72,
  静岡: 138.38, 愛知: 136.91, 三重: 136.51, 滋賀: 135.87, 京都: 135.76, 大阪: 135.52, 兵庫: 135.18,
  奈良: 135.83, 和歌山: 135.17, 鳥取: 134.24, 島根: 133.05, 岡山: 133.93, 広島: 132.46, 山口: 131.47,
  徳島: 134.56, 香川: 134.04, 愛媛: 132.77, 高知: 133.53, 福岡: 130.42, 佐賀: 130.30, 長崎: 129.87,
  熊本: 130.74, 大分: 131.61, 宮崎: 131.42, 鹿児島: 130.56, 沖縄: 127.68,
};
const STANDARD_LON = 135;

// 都道府県名のゆらぎ吸収（「北海道」「東京都」「大阪府」「神奈川県」など接尾辞を落とす）
function lonOf(pref) {
  if (pref == null) return null;
  let key = String(pref).trim();
  if (PREF_LON[key] != null) return PREF_LON[key];
  key = key.replace(/(都|道|府|県)$/, '');
  if (PREF_LON[key] != null) return PREF_LON[key];
  // 「北海道」は接尾辞除去すると「北海」になるので個別救済
  if (key === '北海') return PREF_LON['北海道'];
  return null;
}

// 均時差（分）。N=年内通日。一般的な近似式（誤差±1分弱）。＋は太陽が時計より進む。
function equationOfTime(date) {
  const [y, mo, da] = String(date).split('-').map(Number);
  const start = Date.UTC(y, 0, 0);
  const N = Math.floor((Date.UTC(y, mo - 1, da) - start) / 86400000); // 通日
  const B = (2 * Math.PI * (N - 81)) / 364;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

// 経度時差（分）。基準135°Eより東(+)なら地方時は進む。
function longitudeOffset(lon) { return (lon - STANDARD_LON) * 4; }

// 時刻index（時辰）対応: 子=23-01→0, 丑=01-03→1 … 午=11-13→6 … 亥=21-23→11
function indexFromHour(h) { return Math.floor(((h % 24) + 1) % 24 / 2); }

// JSTの時計時刻＋都道府県 → 真太陽時補正後の時辰index と内訳を返す。
function correctedTimeIndex(date, hhmm, pref) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`時刻は "HH:MM" で指定してください: ${hhmm}`);
  const jstMin = Number(m[1]) * 60 + Number(m[2]);
  const lon = lonOf(pref);
  const lonOff = lon == null ? 0 : longitudeOffset(lon);
  const eot = equationOfTime(date);
  const trueMin = jstMin + lonOff + eot;
  const h = ((trueMin / 60) % 24 + 24) % 24;
  const index = indexFromHour(h);
  const fmt = (min) => { const x = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  return {
    index,
    trueSolar: fmt(trueMin),
    detail: {
      pref: pref || '(指定なし)', lon: lon ?? '(不明→補正なし)',
      経度時差分: Math.round(lonOff * 10) / 10, 均時差分: Math.round(eot * 10) / 10,
      補正合計分: Math.round((lonOff + eot) * 10) / 10, jst: fmt(jstMin),
    },
  };
}

if (require.main === module) {
  const [date, hhmm, pref] = process.argv.slice(2);
  if (!date || !hhmm) { console.error('使い方: node src/solar-time.js <陽暦YYYY-M-D> <HH:MM> [都道府県]'); process.exit(1); }
  const r = correctedTimeIndex(date, hhmm, pref);
  console.log(`JST ${r.detail.jst}（${r.detail.pref}）→ 真太陽時 ${r.trueSolar} → 時刻index ${r.index}`);
  console.log('内訳:', JSON.stringify(r.detail, null, 0));
}

module.exports = { correctedTimeIndex, lonOf, equationOfTime, longitudeOffset, PREF_LON };

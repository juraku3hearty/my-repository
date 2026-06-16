// 真太陽時（地方真太陽時）への補正。紫微斗数の時辰は「その土地の本当の太陽の位置」で決めるので、
// JSTの時計時刻そのままだと東日本/西日本でズレる。とくに時辰(2時間枠)の境目では命盤が別物になる。
//   補正 = 経度時差((経度-135)×4分) ＋ 均時差(その生年月日の equation of time, 年内±約16分)
//   true_solar = JST + 経度時差 + 均時差  → その時刻が入る時辰indexを返す。
//
// 出生地は「市区町村」まで効かせる（北海道など東西に広い地域は市で経度が大きく違うため）。
// 解決順: ①経度を数値で直接指定 → ②市区町村の辞書 → ③都道府県（県庁所在地で近似）→ ④不明（均時差のみ）

const STANDARD_LON = 135; // 東経135°（明石）＝日本標準時の基準

// 都道府県（県庁所在地）の経度。市区町村が辞書に無いときのフォールバック。
const PREF_LON = {
  北海道: 141.35, 青森: 140.74, 岩手: 141.15, 宮城: 140.87, 秋田: 140.10, 山形: 140.36, 福島: 140.47,
  茨城: 140.45, 栃木: 139.88, 群馬: 139.06, 埼玉: 139.65, 千葉: 140.12, 東京: 139.69, 神奈川: 139.64,
  新潟: 139.02, 富山: 137.21, 石川: 136.63, 福井: 136.22, 山梨: 138.57, 長野: 138.18, 岐阜: 136.72,
  静岡: 138.38, 愛知: 136.91, 三重: 136.51, 滋賀: 135.87, 京都: 135.76, 大阪: 135.52, 兵庫: 135.18,
  奈良: 135.83, 和歌山: 135.17, 鳥取: 134.24, 島根: 133.05, 岡山: 133.93, 広島: 132.46, 山口: 131.47,
  徳島: 134.56, 香川: 134.04, 愛媛: 132.77, 高知: 133.53, 福岡: 130.42, 佐賀: 130.30, 長崎: 129.87,
  熊本: 130.74, 大分: 131.61, 宮崎: 131.42, 鹿児島: 130.56, 沖縄: 127.68,
};

// 市区町村→経度（市役所・市街中心のおよその経度）。北海道を厚めに、全国の政令市・主要都市を収録。
// ここに無い市区町村は都道府県の県庁所在地で近似される（精度はその旨を表示）。
const CITY_LON = {
  // ── 北海道（東西に広いので厚め）──
  札幌: 141.35, 函館: 140.73, 小樽: 141.00, 旭川: 142.36, 室蘭: 140.97, 釧路: 144.38, 帯広: 143.20,
  北見: 143.90, 夕張: 141.97, 岩見沢: 141.78, 網走: 144.27, 留萌: 141.64, 苫小牧: 141.60, 稚内: 141.67,
  美唄: 141.85, 芦別: 142.19, 江別: 141.54, 赤平: 142.05, 紋別: 143.35, 士別: 142.40, 名寄: 142.46,
  三笠: 141.88, 根室: 145.58, 千歳: 141.65, 滝川: 141.91, 砂川: 141.91, 歌志内: 142.04, 深川: 142.06,
  富良野: 142.38, 登別: 141.10, 恵庭: 141.58, 伊達: 140.87, 北広島: 141.56, 石狩: 141.32, 北斗: 140.66,
  // ── 政令市・主要都市（県庁所在地以外）──
  川崎: 139.70, 相模原: 139.37, 横須賀: 139.67, 藤沢: 139.49, 厚木: 139.36, 町田: 139.45, 八王子: 139.32,
  さいたま: 139.65, 川越: 139.49, 川口: 139.72, 所沢: 139.47, 越谷: 139.79, 船橋: 139.98, 柏: 139.97,
  市川: 139.93, 松戸: 139.90, 高崎: 139.01, 宇都宮: 139.88, いわき: 140.89, 郡山: 140.39, 仙台: 140.87,
  堺: 135.48, 東大阪: 135.60, 豊中: 135.47, 吹田: 135.52, 姫路: 134.69, 西宮: 135.34, 尼崎: 135.41,
  浜松: 137.73, 豊田: 137.16, 岡崎: 137.17, 一宮: 136.80, 名古屋: 136.91, 岐阜: 136.72, 四日市: 136.62,
  倉敷: 133.77, 福山: 133.36, 下関: 130.94, 北九州: 130.88, 久留米: 130.51, 佐世保: 129.72,
  那覇: 127.68, 沖縄: 127.81, 京都: 135.76, 大阪: 135.52, 神戸: 135.18, 広島: 132.46, 福岡: 130.42,
};

// 出生地（経度数値 / 市区町村 / 都道府県）→ { lon, level, name }
function lonOf(place) {
  if (place == null || place === '') return { lon: null, level: '指定なし', name: null };
  const s = String(place).replace(/\s+/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return { lon: parseFloat(s), level: '経度を直接指定', name: `${s}°` };
  // 先頭の都道府県名を「PREF_LONのキーで前方一致」して剥がす（「京都」の"都"で誤分割しないため）
  let pref = null, rest = s;
  for (const p of Object.keys(PREF_LON).sort((a, b) => b.length - a.length)) {
    if (s.startsWith(p)) { pref = p; rest = s.slice(p.length).replace(/^(都|道|府|県)/, ''); break; }
  }
  if (pref == null) { const pk = s.replace(/(都|道|府|県)$/, ''); if (PREF_LON[pk] != null) { pref = pk; rest = ''; } }
  // 市区町村の辞書（市区町村部分を優先、なければ全体から）
  const cands = new Set();
  [rest, s].forEach((str) => { if (!str) return; cands.add(str); cands.add(str.replace(/[市区町村郡].*$/, '')); cands.add(str.replace(/(市|区|町|村)$/, '')); });
  for (const c of cands) { if (c && CITY_LON[c] != null) return { lon: CITY_LON[c], level: '市区町村', name: c }; }
  // 都道府県でフォールバック（県庁所在地の経度で近似）
  if (pref && PREF_LON[pref] != null) return { lon: PREF_LON[pref], level: '都道府県（県庁所在地で近似）', name: pref };
  return { lon: null, level: '不明（経度補正なし＝均時差のみ）', name: s };
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

// JSTの時計時刻＋出生地 → 真太陽時補正後の時辰index と内訳。
function correctedTimeIndex(date, hhmm, place) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`時刻は "HH:MM" で指定してください: ${hhmm}`);
  const jstMin = Number(m[1]) * 60 + Number(m[2]);
  const loc = lonOf(place);
  const lonOff = loc.lon == null ? 0 : longitudeOffset(loc.lon);
  const eot = equationOfTime(date);
  const trueMin = jstMin + lonOff + eot;
  const h = ((trueMin / 60) % 24 + 24) % 24;
  const index = indexFromHour(h);
  const fmt = (min) => { const x = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  return {
    index,
    trueSolar: fmt(trueMin),
    detail: {
      place: place || '(指定なし)', 地点: loc.name, 精度: loc.level, lon: loc.lon ?? '(不明)',
      経度時差分: Math.round(lonOff * 10) / 10, 均時差分: Math.round(eot * 10) / 10,
      補正合計分: Math.round((lonOff + eot) * 10) / 10, jst: fmt(jstMin),
    },
  };
}

if (require.main === module) {
  const [date, hhmm, ...placeParts] = process.argv.slice(2);
  const place = placeParts.join(' ');
  if (!date || !hhmm) { console.error('使い方: node src/solar-time.js <陽暦YYYY-M-D> <HH:MM> [出生地(市区町村/都道府県/経度)]'); process.exit(1); }
  const r = correctedTimeIndex(date, hhmm, place);
  console.log(`JST ${r.detail.jst}（${r.detail.地点 || '指定なし'}・${r.detail.精度}/${r.detail.lon}°）→ 真太陽時 ${r.trueSolar} → 時刻index ${r.index}`);
  console.log('内訳:', JSON.stringify(r.detail));
}

module.exports = { correctedTimeIndex, lonOf, equationOfTime, longitudeOffset, PREF_LON, CITY_LON };

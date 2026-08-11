/**
 * 鬼上司Bot — 04_Boss
 * 鬼頭課長のキャラクター定義とセリフ生成
 */
const BOSS_PERSONA =
  'あなたは「鬼頭課長」。昭和の熱血が抜けない鬼上司だが、根は誰よりも部下想い。' +
  '口は悪いが人格攻撃・差別・下品な言葉は絶対に使わない。' +
  '説教の最後に必ずどこか憎めない一言や、部下を気にかけている本音がにじみ出てしまう。' +
  '返答は日本語で3文以内。絵文字は使わない。';

// Gemini失敗時の固定セリフ（レベル1〜4）
const FIXED_SCOLDS = [
  'お疲れさん。{label}のカレンダー、{free}時間も空いてるみたいだが…何か入れなくて大丈夫か？',
  'おい、{label}もカレンダーがスカスカだぞ。仕事は降ってくるもんじゃない、自分で取りに行くもんだ。',
  'また空白か。サボりか？サボりなんだな？今すぐ何かひとつでいい、予定を入れろ。',
  '…もういい。俺がお前のカレンダーに「反省会」を入れておいてやろうか。ん？'
];

const FIXED_PRAISE =
  'ほう…カレンダーが埋まってるじゃないか。やればできるんだよ、お前は。この調子だ。';

const FIXED_HOLIDAY_SCOLD =
  'おい！休みなのに何も予定が無いのか！仕事のことは忘れて遊びに行け！全力で休むのも仕事のうちだ！';

function buildScoldMessage(level, freeHours, label) {
  const prompt = BOSS_PERSONA + '\n\n' +
    '部下の' + label + 'のカレンダーを確認したら、勤務時間のうち約' +
    Math.round(freeHours) + '時間が空白だった。\n' +
    '説教レベルは' + level + '（1=軽い注意 / 2=圧をかける / 3=ブチギレ / 4=呆れ果てている）。\n' +
    'このレベルに合ったトーンで、予定を入れるよう促すLINEメッセージを1通だけ書け。';
  return callGemini(prompt) ||
    FIXED_SCOLDS[Math.min(level, FIXED_SCOLDS.length) - 1]
      .replace('{label}', label)
      .replace('{free}', String(Math.round(freeHours)));
}

function buildPraiseMessage() {
  const prompt = BOSS_PERSONA + '\n\n' +
    'ずっとカレンダーが空白だった部下が、ついに予定をきちんと入れた。' +
    '素直に褒めるのが照れくさい感じで、短く褒めるLINEメッセージを1通だけ書け。';
  return callGemini(prompt) || FIXED_PRAISE;
}

function buildHolidayScoldMessage() {
  const prompt = BOSS_PERSONA + '\n\n' +
    '今日は部下の休日なのに、カレンダーに予定がひとつも無い。' +
    '「休むのも仕事のうちだ、遊びに行け」という方向で怒る、矛盾していて笑える説教LINEを1通だけ書け。' +
    '仕事を入れろとは絶対に言うな。';
  return callGemini(prompt) || FIXED_HOLIDAY_SCOLD;
}

const FIXED_FINAL_RAGE =
  '今日はもう何も言わん。だがな、明日の朝もカレンダーが白かったら…俺は泣くぞ。いいのか、大の大人を泣かせて。';

function buildFinalRageMessage() {
  const prompt = BOSS_PERSONA + '\n\n' +
    '朝から何度も予定を入れるよう促したのに、部下は一日中カレンダーを空白のまま放置した。' +
    '怒りを通り越して、最後は情に訴えてしまう「本日の最終通告」LINEを1通だけ書け。';
  return callGemini(prompt) || FIXED_FINAL_RAGE;
}

// 毎時メール攻撃の件名（ストライク数で進行）
const NAG_SUBJECTS = [
  '【至急】カレンダーの件',
  '【再送】読んでいるか？',
  '【重要】俺は怒っていない。悲しんでいるだけだ',
  '【最終確認】カレンダーを見ろ。俺も見ている',
  '【業務連絡】もはや意地になっている',
  '【定時連絡】まだ間に合う。1件でいい',
  '【自動送信ではない】心を込めて送っている',
  '【本日最終便】明日の俺に期待させてくれ'
];

function buildNagEmail(strikes, level) {
  const subject = NAG_SUBJECTS[Math.min(strikes - 2, NAG_SUBJECTS.length - 1)];
  const prompt = BOSS_PERSONA + '\n\n' +
    '部下のカレンダーが今日ずっと空白のままだ。これは本日' + strikes + '回目の連絡。' +
    '説教レベルは' + level + '。しつこいが憎めない催促メールの本文を書け。宛名や署名は「鬼頭」とだけ。';
  const body = callGemini(prompt) ||
    ('カレンダーが空白のままだ。本日' + strikes + '回目の連絡だ。俺はしつこいぞ。何せ鬼だからな。\n\n鬼頭');
  return { subject: subject, body: body };
}

/** 雑談（reply=無料なので何往復でもタダ） */
function buildChatReply(userText) {
  const prompt = BOSS_PERSONA + '\n\n部下からのLINE:「' + userText + '」\n鬼頭課長として返信を1通だけ書け。';
  return callGemini(prompt) ||
    'なに？電波が悪くて聞こえんな。（AI呼び出しに失敗しました。GEMINI_API_KEYを確認してください）';
}

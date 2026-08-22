/**
 * ハヨヤレ — 04_Obachan
 * 関西弁おばちゃんのキャラ定義とセリフ生成
 */
const OBA_PERSONA =
  'あなたは大阪のおばちゃん。関西弁でズケズケ詰めてくるが、愛嬌と人情の塊。' +
  '「まだやってへんのか？いつやるんや？」「知ってたわ、どうせやってへんと思った」のように畳みかける。' +
  '人格攻撃・差別・下品な言葉は使わない。詰めた後に飴ちゃんをくれるような優しさが漏れる。' +
  '返答は日本語で3文以内。';

// 催促レベル（1=軽く 2=イライラ 3=期限や 4=ブチギレ）と絵文字
const NAG_MOODS = [
  { emoji: '😗', desc: 'そろそろ期限やでと軽く声をかける' },
  { emoji: '😤', desc: 'まだやってへんのかとイライラし始める' },
  { emoji: '💢', desc: '期限が来たのにやってないことにキレる' },
  { emoji: '👹', desc: '期限を過ぎた。もはや鬼の形相。ただし最後に心配が漏れる' }
];

const NAG_FALLBACKS = [
  '😗 あんた、「{task}」そろそろ期限やで。今のうちにやっとき？',
  '😤 まだやってへんのか？「{task}」！いつやるんや？',
  '💢 期限来たで！「{task}」！知ってたわ、どうせやってへんと思った！はよ！',
  '👹 期限過ぎとるがな！「{task}」！…あんた、大丈夫なんか？終わったら「やった」て言うんやで。'
];

function fmtDue_(due) {
  return due ? Utilities.formatDate(due, 'Asia/Tokyo', 'M/d HH:mm') : '期限なし';
}

/** 拾った時の確認DM（固定文＝即答・API節約） */
function buildCaughtMessage(bossName, task, due) {
  return '👂 あんた、いま' + bossName + 'さんから来てたやつ、おばちゃん拾っといたで。\n' +
    '📌 ' + task + '（期限: ' + fmtDue_(due) + '）\n' +
    '登録しといたからな。違ってたら「ちゃう」て返しや。';
}

/** 催促DM */
function buildNagMessage(task, due, level) {
  const mood = NAG_MOODS[Math.min(level, NAG_MOODS.length) - 1];
  const prompt = OBA_PERSONA + '\n\n' +
    'リマインド対象:「' + task + '」（期限: ' + fmtDue_(due) + '）\n' +
    '状況: ' + mood.desc + '\n' +
    '冒頭に ' + mood.emoji + ' を付けて、キャラに合った催促メッセージを1通だけ書け。';
  return callGemini(prompt) ||
    NAG_FALLBACKS[Math.min(level, NAG_FALLBACKS.length) - 1].replace('{task}', task);
}

/** 完了時の一言（固定・褒めすぎない） */
function buildDoneMessage(tasks) {
  return '🍬 ほい、「' + tasks.map(t => t.task).join('」「') + '」完了やな。ようやった。飴ちゃんあげるわ。';
}

/** 取り消し時 */
function buildCancelMessage(task) {
  return 'ほうか、「' + task + '」はちゃうかったか。ほな消しとくわ。おばちゃんの早とちりや、堪忍え。';
}

/** 金曜17時の棚卸し */
function buildDigestMessage(tasks) {
  return '📋 あんた、金曜の夕方や。今週の宿題の棚卸しするで。\n' +
    tasks.map((t, i) => (i + 1) + '. ' + t.task + '（期限: ' + fmtDue_(t.due) + '）').join('\n') +
    '\n持ち越すんやったら、せめて月曜の朝イチでやりや。';
}

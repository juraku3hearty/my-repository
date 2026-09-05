/**
 * 日付ユーティリティ（すべて Asia/Tokyo 基準）
 *
 * Vercel のサーバーは UTC で動くので、素の new Date() の日付をそのまま使うと
 * 深夜〜朝9時のあいだ「今日」が1日ずれる。日付境界は必ずここを通す。
 */

const TZ = 'Asia/Tokyo';

const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 'YYYY-MM-DD'（JST） */
export function todayStr(base: Date = new Date()): string {
  return YMD.format(base);
}

/** 'YYYY-MM-DD' を n 日ずらす */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** 0=日 〜 6=土 */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayLabel(dateStr: string): string {
  return WEEKDAY_JA[weekdayOf(dateStr)];
}

/** '9/8(月)' */
export function shortDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}(${weekdayLabel(dateStr)})`;
}

/** 今日・明日・明後日は言葉で、それ以降は日付で */
export function relativeDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return '今日';
  if (dateStr === addDays(today, 1)) return '明日';
  if (dateStr === addDays(today, 2)) return 'あさって';
  return shortDateLabel(dateStr);
}

/** 'YYYY-MM-DD' + 'HH:MM' → JST として解釈した ISO 文字列 */
export function jstIso(dateStr: string, time: string): string {
  return `${dateStr}T${time}:00+09:00`;
}

/** ISO → 'HH:MM'（JST） */
export function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso));
}

/** ISO → 'YYYY-MM-DD'（JST） */
export function dateOf(iso: string): string {
  return YMD.format(new Date(iso));
}

/**
 * 「今週」＝今日から1週間先まで（今日を含めて8日）。
 *
 * 暦の週（日曜始まり）にすると金曜や土曜に開いたとき1〜2日しか出ず、
 * 段取りボードとして役に立たない。今日と同じ曜日の1週間後まで含めることで、
 * どの曜日に開いても全曜日が1回ずつ視界に入る。
 */
export function restOfWeek(today: string): string[] {
  return Array.from({ length: 8 }, (_, i) => addDays(today, i));
}

/** 今日より後で最初に来る指定曜日（0=日〜6=土） */
export function nextWeekday(today: string, weekday: number): string {
  for (let i = 1; i <= 7; i++) {
    const c = addDays(today, i);
    if (weekdayOf(c) === weekday) return c;
  }
  return addDays(today, 7);
}

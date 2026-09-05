/**
 * スナップショット（＝DBそのままの形）から、画面に出す段取りボードを組み立てる。
 *
 * ここが「曜日デフォルト＋例外」を1枚の絵にするところ。
 * 通知エンジン（スプリント3）も同じ関数を使って「何を誰に送るか」を決める予定なので、
 * React には一切依存させない。
 */

import {
  addDays,
  dateOf,
  relativeDayLabel,
  restOfWeek,
  shortDateLabel,
  timeOf,
  todayStr,
  weekdayLabel,
  weekdayOf
} from './date';
import type {
  BoardAlert,
  BoardData,
  BoardEvent,
  BoardTask,
  DaySection,
  DinnerRow,
  DinnerSummary,
  FamilySnapshot,
  Member,
  Weekday
} from './types';

function byId(members: Member[]): Map<string, Member> {
  return new Map(members.map((m) => [m.id, m]));
}

/** その日その人の夕飯：例外があれば例外、無ければ曜日デフォルト */
function dinnerRowFor(
  snap: FamilySnapshot,
  member: Member,
  date: string
): DinnerRow {
  const wd = weekdayOf(date) as Weekday;
  const def = snap.weekdayDefaults.find(
    (d) => d.memberId === member.id && d.weekday === wd
  );
  const ov = snap.overrides.find(
    (o) => o.memberId === member.id && o.date === date
  );

  const choice = ov?.dinner ?? def?.dinner ?? 'unknown';
  const bento = ov?.bento ?? def?.bento ?? false;
  const homeBy = ov?.homeBy !== undefined ? ov.homeBy : (def?.homeBy ?? null);

  return {
    member,
    choice,
    bento,
    homeBy: homeBy ?? null,
    isException: Boolean(ov && ov.dinner !== undefined && ov.dinner !== def?.dinner),
    needsAnswer: choice === 'unknown'
  };
}

function dinnerSummaryFor(snap: FamilySnapshot, date: string): DinnerSummary {
  const rows = snap.members
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => dinnerRowFor(snap, m, date));

  return {
    date,
    rows,
    countIn: rows.filter((r) => r.choice === 'in').length,
    countOut: rows.filter((r) => r.choice === 'out').length,
    countUnknown: rows.filter((r) => r.choice === 'unknown').length,
    bentoMembers: rows.filter((r) => r.bento).map((r) => r.member)
  };
}

/**
 * 予定の見え方。他人のプライベート予定は抽象表現に置き換える（MVP-5）。
 * viewerId が予定の持ち主なら詳細をそのまま出す。
 */
function boardEventFor(
  snap: FamilySnapshot,
  eventId: string,
  viewerId: string
): BoardEvent {
  const ev = snap.events.find((e) => e.id === eventId)!;
  const owner = ev.ownerMemberId
    ? (byId(snap.members).get(ev.ownerMemberId) ?? null)
    : null;
  const isOwner = ev.ownerMemberId === viewerId;
  const masked = ev.visibility === 'private' && !isOwner;

  return {
    event: ev,
    owner,
    label: masked ? (ev.abstractLabel ?? '予定あり') : ev.title,
    masked
  };
}

function dueLabelFor(dueIso: string, today: string): string {
  const d = dateOf(dueIso);
  const t = timeOf(dueIso);
  if (d === today) return `今日 ${t}`;
  if (d === addDays(today, -1)) return `昨日 ${t}`;
  if (d === addDays(today, 1)) return `明日 ${t}`;
  return `${shortDateLabel(d)} ${t}`;
}

function boardTaskFor(
  snap: FamilySnapshot,
  taskId: string,
  today: string,
  now: Date
): BoardTask {
  const task = snap.tasks.find((t) => t.id === taskId)!;
  const assignee = task.assigneeMemberId
    ? (byId(snap.members).get(task.assigneeMemberId) ?? null)
    : null;

  return {
    task,
    assignee,
    overdue: task.status === 'open' && new Date(task.dueAt).getTime() < now.getTime(),
    unassigned: task.status === 'open' && task.assigneeMemberId === null,
    dueLabel: dueLabelFor(task.dueAt, today)
  };
}

export function buildBoard(
  snap: FamilySnapshot,
  viewerId: string,
  now: Date = new Date()
): BoardData {
  const today = todayStr(now);
  const dates = restOfWeek(today);

  const days: DaySection[] = dates.map((date) => {
    const events = snap.events
      .filter((e) => e.date === date)
      .sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? ''))
      .map((e) => boardEventFor(snap, e.id, viewerId));

    const tasks = snap.tasks
      .filter((t) => dateOf(t.dueAt) === date)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .map((t) => boardTaskFor(snap, t.id, today, now));

    return {
      date,
      label: relativeDayLabel(date, today),
      weekdayLabel: weekdayLabel(date),
      dinner: dinnerSummaryFor(snap, date),
      events,
      tasks
    };
  });

  return { family: snap.family, members: snap.members, days, alerts: buildAlerts(snap, days, today, now) };
}

/**
 * 最優先で上に出すもの＝「①期限超過 ②担当未定 ③未回答」。
 * この3つが空っぽの日は、ボードの上には何も出ない（＝鳥は黙る）。
 */
function buildAlerts(
  snap: FamilySnapshot,
  days: DaySection[],
  today: string,
  now: Date
): BoardAlert[] {
  const alerts: BoardAlert[] = [];

  // ① 期限超過（今週の枠に入らない過去分も拾う）
  for (const t of snap.tasks) {
    if (t.status !== 'open') continue;
    if (new Date(t.dueAt).getTime() >= now.getTime()) continue;
    const bt = boardTaskFor(snap, t.id, today, now);
    alerts.push({
      kind: 'overdue',
      title: t.title,
      detail: `${bt.dueLabel} が期限。まだ終わってへんで`,
      member: bt.assignee,
      taskId: t.id
    });
  }

  // ② 担当未定（募集中）
  for (const day of days) {
    for (const bt of day.tasks) {
      if (!bt.unassigned || bt.overdue) continue;
      alerts.push({
        kind: 'unassigned',
        title: bt.task.title,
        detail: `${day.label} ${timeOf(bt.task.dueAt)}・担当がまだ決まってへん`,
        member: null,
        taskId: bt.task.id
      });
    }
  }

  // ③ 未回答（夕飯）— 今日と明日のぶんだけ。先の日まで赤くしても意味がない
  for (const day of days.slice(0, 2)) {
    for (const row of day.dinner.rows) {
      if (!row.needsAnswer) continue;
      alerts.push({
        kind: 'unanswered',
        title: `${row.member.name}の${day.label}の夕飯`,
        detail: 'いる／いらん がまだ',
        member: row.member,
        memberId: row.member.id,
        date: day.date
      });
    }
  }

  return alerts;
}

/**
 * 閲覧者に渡す前に、他人のプライベート予定の本文を落とす。
 *
 * 画面で隠すだけでは不十分で、ページのソース（RSCペイロード）に本文が残ってしまう。
 * プライバシー分離はサーバー側で落として初めて成立する。
 *
 * スプリント1は「誰として見るか」を切り替える開発用スイッチがあるので未適用。
 * LIFFログインで閲覧者が確定するスプリント2で page.tsx に差し込み、
 * 同じ関数を会話クエリの応答生成でも通す（LINEで聞かれても詳細を答えない）。
 */
export function maskSnapshotFor(
  snap: FamilySnapshot,
  viewerId: string
): FamilySnapshot {
  return {
    ...snap,
    events: snap.events.map((ev) => {
      if (ev.visibility !== 'private' || ev.ownerMemberId === viewerId) return ev;
      return {
        ...ev,
        title: ev.abstractLabel ?? '予定あり',
        place: null
      };
    })
  };
}

/**
 * ダンドリのひとこと。
 * 設計原則2「平和な日は、鳥は黙る」に従い、用が無ければ null を返す。
 */
export function dandoriLine(board: BoardData): string | null {
  const overdue = board.alerts.filter((a) => a.kind === 'overdue').length;
  const unassigned = board.alerts.filter((a) => a.kind === 'unassigned').length;
  const unanswered = board.alerts.filter((a) => a.kind === 'unanswered');

  if (overdue > 0) {
    return `期限すぎたんが${overdue}件あるで。上から片付けよか`;
  }
  if (unassigned > 0) {
    return `担当が決まってへんのが${unassigned}件。誰か手ぇ挙げてー`;
  }
  if (unanswered.length > 0) {
    const names = Array.from(new Set(unanswered.map((a) => a.member?.name).filter(Boolean)));
    return `${names.join('と')}の夕飯だけ、まだ聞けてへん`;
  }
  return null;
}

/**
 * ダンドリ — ドメイン型
 *
 * supabase/schema.sql のテーブル定義と1対1で対応させる。
 * DB は snake_case、アプリ側は camelCase。
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=日

/** 夕飯の状態。unknown = まだ誰も答えていない（ダンドリが聞きに行く対象） */
export type DinnerChoice = 'in' | 'out' | 'unknown';

/**
 * メンバー3タイプ（設計原則3に対応）
 * line    … LINE接続済み。自分宛のことだけ届く
 * profile … LINE無し（小さい子など）。通知は担当の親へ回す
 * muted   … 通知オフ（年頃の子）。ボードを開いた時だけ応答
 */
export type MemberType = 'line' | 'profile' | 'muted';

export type Visibility = 'private' | 'abstract' | 'shared';

export type TaskKind = 'prep' | 'chore' | 'pickup';

export type TaskStatus = 'open' | 'done' | 'skipped';

export type Plan = 'free' | 'paid';

export interface Family {
  id: string;
  name: string;
  plan: Plan;
  lineGroupId: string | null;
}

export interface Member {
  id: string;
  familyId: string;
  name: string;
  /** ボードのチップに出す1〜3文字 */
  shortName: string;
  role: string;
  memberType: MemberType;
  color: string;
  sortOrder: number;
}

/**
 * 曜日別デフォルト（設計原則2の心臓部）
 * 初期設定ウィザードで必ず埋めさせる。ここが埋まっている限りダンドリは黙る。
 */
export interface WeekdayDefault {
  memberId: string;
  weekday: Weekday;
  dinner: DinnerChoice; // unknown を入れた曜日だけ毎回聞かれる
  bento: boolean;
  /** 'HH:MM' 帰宅目安。null = 決まっていない */
  homeBy: string | null;
}

/** その日の例外だけを持つ。デフォルト通りの日はレコードが存在しない */
export interface DayOverride {
  memberId: string;
  /** YYYY-MM-DD */
  date: string;
  dinner?: DinnerChoice;
  bento?: boolean;
  homeBy?: string | null;
  note?: string;
  /** 本人が答えた時刻。null なら未回答（＝赤表示の対象） */
  answeredAt: string | null;
}

/**
 * 予定。詳細（title / place）は本人だけ、家族には abstractLabel しか見せない。
 * 1回の入力で「個人予定」と「家族への見せ方」が同時に決まる（MVP-4）。
 */
export interface FamilyEvent {
  id: string;
  familyId: string;
  /** YYYY-MM-DD */
  date: string;
  /** 'HH:MM' */
  startAt: string | null;
  endAt: string | null;
  title: string;
  place: string | null;
  ownerMemberId: string | null;
  visibility: Visibility;
  /** 家族に見える抽象表現（visibility='private' のとき必須） */
  abstractLabel: string | null;
  source: 'manual' | 'ocr' | 'line';
}

/**
 * タスク。assigneeMemberId が null = 担当未定（グループに募集を出す対象）
 */
export interface Task {
  id: string;
  familyId: string;
  eventId: string | null;
  title: string;
  /** ISO8601 */
  dueAt: string;
  assigneeMemberId: string | null;
  kind: TaskKind;
  status: TaskStatus;
  source: 'manual' | 'ocr' | 'line' | 'auto';
}

export interface FamilySnapshot {
  family: Family;
  members: Member[];
  weekdayDefaults: WeekdayDefault[];
  overrides: DayOverride[];
  events: FamilyEvent[];
  tasks: Task[];
}

/* ------------------------------------------------------------------ */
/* ボード用の導出型（DBには存在しない。lib/board.ts が組み立てる）      */
/* ------------------------------------------------------------------ */

export interface DinnerRow {
  member: Member;
  choice: DinnerChoice;
  bento: boolean;
  homeBy: string | null;
  /** デフォルトのままか、その日だけの例外か */
  isException: boolean;
  /** 未回答（choice==='unknown'）＝ダンドリが聞きに行く */
  needsAnswer: boolean;
}

export interface DinnerSummary {
  date: string;
  rows: DinnerRow[];
  countIn: number;
  countOut: number;
  countUnknown: number;
  bentoMembers: Member[];
}

export interface BoardEvent {
  event: FamilyEvent;
  owner: Member | null;
  /** 閲覧者に見せてよい表示名 */
  label: string;
  /** 詳細が隠されているか（他人のプライベート予定） */
  masked: boolean;
}

export interface BoardTask {
  task: Task;
  assignee: Member | null;
  overdue: boolean;
  /** 担当未定＝家族に募集中 */
  unassigned: boolean;
  dueLabel: string;
}

export type AlertKind = 'overdue' | 'unassigned' | 'unanswered';

export interface BoardAlert {
  kind: AlertKind;
  title: string;
  detail: string;
  /** 誰の話か（未回答なら本人、未定なら null＝家族全員） */
  member: Member | null;
  taskId?: string;
  memberId?: string;
  date?: string;
}

export interface DaySection {
  /** YYYY-MM-DD */
  date: string;
  label: string;
  weekdayLabel: string;
  dinner: DinnerSummary;
  events: BoardEvent[];
  tasks: BoardTask[];
}

export interface BoardData {
  family: Family;
  members: Member[];
  /** 今日・明日・今週（残り） */
  days: DaySection[];
  alerts: BoardAlert[];
}

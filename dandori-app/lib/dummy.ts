/**
 * スプリント1のダミーデータ（平井家）
 *
 * Supabase を繋ぐまでの仮置き。schema.sql の各テーブルと同じ形をしているので、
 * 差し替えるときは buildSnapshot() の中身を supabase クエリに置き換えるだけでよい。
 * 日付は「今日」からの相対で生成するので、いつ開いてもボードが埋まって見える。
 */

import { addDays, jstIso, nextWeekday, todayStr } from './date';
import type {
  DayOverride,
  Family,
  FamilyEvent,
  FamilySnapshot,
  Member,
  Task,
  Weekday,
  WeekdayDefault
} from './types';

const FAMILY_ID = 'fam_hirai';

const family: Family = {
  id: FAMILY_ID,
  name: '平井家',
  plan: 'free',
  lineGroupId: null
};

const members: Member[] = [
  {
    id: 'm_mayu',
    familyId: FAMILY_ID,
    name: 'まゆ',
    shortName: '母',
    role: '母',
    memberType: 'line',
    color: '#e07a4f',
    sortOrder: 1
  },
  {
    id: 'm_taka',
    familyId: FAMILY_ID,
    name: 'たかし',
    shortName: '父',
    role: '父',
    memberType: 'line',
    color: '#4a7fb0',
    sortOrder: 2
  },
  {
    id: 'm_sota',
    familyId: FAMILY_ID,
    name: 'そうた',
    shortName: '兄',
    role: '長男(中2)',
    memberType: 'muted',
    color: '#5b9e6b',
    sortOrder: 3
  },
  {
    id: 'm_hina',
    familyId: FAMILY_ID,
    name: 'ひなた',
    shortName: '妹',
    role: '長女(小4)',
    memberType: 'profile',
    color: '#c06a9e',
    sortOrder: 4
  }
];

/** 曜日デフォルトをまとめて作るヘルパー */
function defaults(
  memberId: string,
  rows: Partial<Record<Weekday, Omit<WeekdayDefault, 'memberId' | 'weekday'>>>,
  fallback: Omit<WeekdayDefault, 'memberId' | 'weekday'>
): WeekdayDefault[] {
  const out: WeekdayDefault[] = [];
  for (let w = 0; w <= 6; w++) {
    const wd = w as Weekday;
    out.push({ memberId, weekday: wd, ...(rows[wd] ?? fallback) });
  }
  return out;
}

const weekdayDefaults: WeekdayDefault[] = [
  // 母：基本いつも家で食べる
  ...defaults(
    'm_mayu',
    {
      0: { dinner: 'in', bento: false, homeBy: null },
      6: { dinner: 'in', bento: false, homeBy: null }
    },
    { dinner: 'in', bento: false, homeBy: '18:30' }
  ),
  // 父：火・木は定例で遅いので最初から「いらん」
  ...defaults(
    'm_taka',
    {
      0: { dinner: 'in', bento: false, homeBy: null },
      2: { dinner: 'out', bento: false, homeBy: '22:00' },
      4: { dinner: 'out', bento: false, homeBy: '22:00' },
      6: { dinner: 'in', bento: false, homeBy: null }
    },
    { dinner: 'in', bento: false, homeBy: '20:00' }
  ),
  // 長男：部活。水曜は弁当。土曜は試合で読めないので unknown＝毎回聞く曜日
  ...defaults(
    'm_sota',
    {
      0: { dinner: 'in', bento: false, homeBy: null },
      3: { dinner: 'in', bento: true, homeBy: '19:30' },
      6: { dinner: 'unknown', bento: false, homeBy: null }
    },
    { dinner: 'in', bento: false, homeBy: '19:30' }
  ),
  // 長女：全部いる
  ...defaults(
    'm_hina',
    {
      0: { dinner: 'in', bento: false, homeBy: null },
      6: { dinner: 'in', bento: false, homeBy: null }
    },
    { dinner: 'in', bento: false, homeBy: '16:00' }
  )
];

export function buildSnapshot(base: Date = new Date()): FamilySnapshot {
  const today = todayStr(base);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const d3 = addDays(today, 3);
  const d5 = addDays(today, 5);

  /**
   * 練習試合の日＝次の土曜。
   * 今日を含めてしまうと「今日は未回答」の例と同じ日に例外が2つ載るので、必ず明日以降から探す。
   */
  const saturday = nextWeekday(today, 6);

  const overrides: DayOverride[] = [
    // 父：今日は会食なので夕飯いらん（本人がワンタップで申告済み＝例外）
    {
      memberId: 'm_taka',
      date: today,
      dinner: 'out',
      homeBy: '23:00',
      note: '会食',
      answeredAt: jstIso(today, '09:12')
    },
    // 長男：今日だけ未回答。ダンドリが聞きに行く対象＝ボードで赤くなる
    {
      memberId: 'm_sota',
      date: today,
      dinner: 'unknown',
      answeredAt: null
    },
    // 長男：土曜の練習試合は弁当いる（プリントOCRから自動で入った例外）
    {
      memberId: 'm_sota',
      date: saturday,
      dinner: 'in',
      bento: true,
      note: '練習試合',
      answeredAt: jstIso(today, '07:40')
    }
  ];

  const events: FamilyEvent[] = [
    {
      id: 'ev_swim',
      familyId: FAMILY_ID,
      date: today,
      startAt: '17:00',
      endAt: '18:30',
      title: 'スイミング',
      place: '市民プール',
      ownerMemberId: 'm_hina',
      visibility: 'shared',
      abstractLabel: null,
      source: 'manual'
    },
    {
      id: 'ev_kaishoku',
      familyId: FAMILY_ID,
      date: today,
      startAt: '19:00',
      endAt: '22:00',
      // 詳細は本人だけ。家族には abstractLabel しか出さない
      title: '○○商事 山田様と会食',
      place: '梅田',
      ownerMemberId: 'm_taka',
      visibility: 'private',
      abstractLabel: '外出（帰り23時ごろ）',
      source: 'manual'
    },
    {
      id: 'ev_match',
      familyId: FAMILY_ID,
      date: saturday,
      startAt: '08:00',
      endAt: '15:00',
      title: '練習試合',
      place: '南中学校',
      ownerMemberId: 'm_sota',
      visibility: 'shared',
      abstractLabel: null,
      source: 'ocr'
    },
    {
      id: 'ev_sankan',
      familyId: FAMILY_ID,
      date: d3,
      startAt: '14:00',
      endAt: '15:30',
      title: '授業参観',
      place: '第一小学校',
      ownerMemberId: 'm_hina',
      visibility: 'shared',
      abstractLabel: null,
      source: 'ocr'
    },
    {
      id: 'ev_ensoku',
      familyId: FAMILY_ID,
      date: d5,
      startAt: '08:20',
      endAt: '15:00',
      title: '遠足（明石公園）',
      place: '明石公園',
      ownerMemberId: 'm_hina',
      visibility: 'shared',
      abstractLabel: null,
      source: 'ocr'
    }
  ];

  const tasks: Task[] = [
    {
      id: 'tk_shukin',
      familyId: FAMILY_ID,
      eventId: null,
      title: '給食費の集金袋を持たせる',
      dueAt: jstIso(yesterday, '07:30'),
      assigneeMemberId: 'm_mayu',
      kind: 'chore',
      status: 'open',
      source: 'manual'
    },
    {
      id: 'tk_pickup_swim',
      familyId: FAMILY_ID,
      eventId: 'ev_swim',
      title: 'ひなたを市民プールに送る',
      dueAt: jstIso(today, '16:40'),
      assigneeMemberId: null, // 担当未定＝グループに募集が出る
      kind: 'pickup',
      status: 'open',
      source: 'auto'
    },
    {
      id: 'tk_jersey',
      familyId: FAMILY_ID,
      eventId: null,
      title: 'ジャージを洗濯カゴから出す',
      dueAt: jstIso(today, '21:00'),
      assigneeMemberId: 'm_sota', // 本人に直行（母に集めない）
      kind: 'prep',
      status: 'open',
      source: 'ocr'
    },
    {
      id: 'tk_bottle',
      familyId: FAMILY_ID,
      eventId: null,
      title: '水筒を洗って出す',
      dueAt: jstIso(today, '21:30'),
      assigneeMemberId: 'm_hina',
      kind: 'chore',
      status: 'done',
      source: 'manual'
    },
    {
      id: 'tk_bento',
      familyId: FAMILY_ID,
      eventId: 'ev_match',
      title: '練習試合の弁当と水筒',
      dueAt: jstIso(saturday, '06:30'),
      assigneeMemberId: 'm_mayu',
      kind: 'prep',
      status: 'open',
      source: 'ocr'
    },
    {
      id: 'tk_sankan_reply',
      familyId: FAMILY_ID,
      eventId: 'ev_sankan',
      title: '授業参観の出欠票を出す（誰が行く？）',
      dueAt: jstIso(addDays(today, 2), '08:00'),
      assigneeMemberId: null,
      kind: 'chore',
      status: 'open',
      source: 'ocr'
    },
    {
      id: 'tk_ensoku_prep',
      familyId: FAMILY_ID,
      eventId: 'ev_ensoku',
      title: '遠足のしおり確認・おやつ300円',
      dueAt: jstIso(addDays(d5, -1), '20:00'),
      assigneeMemberId: 'm_mayu',
      kind: 'prep',
      status: 'open',
      source: 'ocr'
    }
  ];

  return { family, members, weekdayDefaults, overrides, events, tasks };
}

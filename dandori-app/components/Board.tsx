'use client';

import { useMemo, useState } from 'react';
import Avatar from './Avatar';
import DayView from './DayView';
import { buildBoard, dandoriLine } from '@/lib/board';
import { shortDateLabel, timeOf } from '@/lib/date';
import type { DinnerChoice, FamilySnapshot } from '@/lib/types';

type Tab = 'today' | 'tomorrow' | 'week';

export default function Board({
  snapshot,
  nowIso,
  initialTab = 'today',
  initialViewerId
}: {
  snapshot: FamilySnapshot;
  nowIso: string;
  initialTab?: Tab;
  initialViewerId?: string;
}) {
  const [snap, setSnap] = useState<FamilySnapshot>(snapshot);
  const [viewerId, setViewerId] = useState<string>(
    initialViewerId ?? snapshot.members[0].id
  );
  const [tab, setTab] = useState<Tab>(initialTab);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const board = useMemo(() => buildBoard(snap, viewerId, now), [snap, viewerId, now]);
  const says = dandoriLine(board);

  const viewer = board.members.find((m) => m.id === viewerId) ?? null;

  /* ---------------- 操作（設計原則1：家族は返事するだけ） ---------------- */

  function answerDinner(memberId: string, date: string, choice: DinnerChoice) {
    setSnap((prev) => {
      const rest = prev.overrides.filter(
        (o) => !(o.memberId === memberId && o.date === date)
      );
      const existing = prev.overrides.find(
        (o) => o.memberId === memberId && o.date === date
      );
      return {
        ...prev,
        overrides: [
          ...rest,
          {
            ...(existing ?? { memberId, date }),
            memberId,
            date,
            dinner: choice,
            answeredAt: new Date().toISOString()
          }
        ]
      };
    });
  }

  function claimTask(taskId: string) {
    setSnap((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, assigneeMemberId: viewerId } : t
      )
    }));
  }

  function toggleDone(taskId: string) {
    setSnap((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t
      )
    }));
  }

  /* ---------------- 表示 ---------------- */

  const today = board.days[0];
  const tomorrow = board.days[1];

  const todayBadge = board.alerts.filter(
    (a) => a.kind !== 'unanswered' || a.date === today.date
  ).length;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🐦</span>
          <span className="brand-name">ダンドリ</span>
          <span className="brand-family">{board.family.name}</span>
        </div>

        {says ? (
          <div className="says">
            <span className="says-bird">🐦</span>
            <span>{says}</span>
          </div>
        ) : (
          <div className="says says-quiet">
            <span className="says-bird">😴</span>
            <span>今日は言うことないわ。平和でよろしい</span>
          </div>
        )}

        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'today'}
            onClick={() => setTab('today')}
          >
            今日
            {todayBadge > 0 && <span className="tab-badge">{todayBadge}</span>}
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'tomorrow'}
            onClick={() => setTab('tomorrow')}
          >
            明日
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'week'}
            onClick={() => setTab('week')}
          >
            今週
          </button>
        </div>
      </header>

      {board.alerts.length > 0 && (
        <section className="alerts">
          <h2>まず、これ</h2>
          {board.alerts.map((a, i) => (
            <div className="alert-row" key={`${a.kind}-${a.taskId ?? a.memberId}-${i}`}>
              <Avatar member={a.member} />
              <div className="alert-body">
                <div className="alert-title">{a.title}</div>
                <div className="alert-detail">{a.detail}</div>
              </div>
              <span className="btn-group">
                {a.kind === 'unanswered' && a.memberId && a.date && (
                  <>
                    <button
                      className="btn primary"
                      onClick={() => answerDinner(a.memberId!, a.date!, 'in')}
                    >
                      いる
                    </button>
                    <button
                      className="btn"
                      onClick={() => answerDinner(a.memberId!, a.date!, 'out')}
                    >
                      いらん
                    </button>
                  </>
                )}
                {a.kind === 'unassigned' && a.taskId && (
                  <button className="btn primary" onClick={() => claimTask(a.taskId!)}>
                    引き受ける
                  </button>
                )}
                {a.kind === 'overdue' && a.taskId && (
                  <button className="btn primary" onClick={() => toggleDone(a.taskId!)}>
                    やった
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      {tab === 'today' && (
        <>
          <div className="section-head">
            <h2>今日</h2>
            <span className="sub">{shortDateLabel(today.date)}</span>
          </div>
          <DayView
            day={today}
            viewerId={viewerId}
            onAnswer={answerDinner}
            onClaim={claimTask}
            onToggleDone={toggleDone}
          />
        </>
      )}

      {tab === 'tomorrow' && tomorrow && (
        <>
          <div className="section-head">
            <h2>明日</h2>
            <span className="sub">{shortDateLabel(tomorrow.date)}</span>
          </div>
          <DayView
            day={tomorrow}
            viewerId={viewerId}
            onAnswer={answerDinner}
            onClaim={claimTask}
            onToggleDone={toggleDone}
          />
        </>
      )}

      {tab === 'week' && (
        <>
          {board.days.map((day) => {
            const open = day.tasks.filter((t) => t.task.status !== 'done');
            const quiet =
              open.length === 0 && day.events.length === 0 && day.dinner.countUnknown === 0;
            return (
              <div className="card" key={day.date}>
                <h3 className="card-title">
                  {day.label}
                  {/* 「今日」「明日」のときだけ日付を添える（4日目以降は label 自体が日付） */}
                  {day.label !== shortDateLabel(day.date) && (
                    <span className="spacer">{shortDateLabel(day.date)}</span>
                  )}
                </h3>

                <div className="row-meta" style={{ marginBottom: quiet ? 0 : 8 }}>
                  <span className="tag in">夕飯 {day.dinner.countIn}人</span>
                  {day.dinner.countOut > 0 && (
                    <span className="tag out">いらん {day.dinner.countOut}人</span>
                  )}
                  {day.dinner.countUnknown > 0 && (
                    <span className="tag unknown">未回答 {day.dinner.countUnknown}人</span>
                  )}
                  {day.dinner.bentoMembers.map((m) => (
                    <span className="tag" key={m.id}>
                      弁当 {m.name}
                    </span>
                  ))}
                </div>

                {quiet && <p className="empty">静かな日</p>}

                {day.events.map((be) => (
                  <div className="row" key={be.event.id}>
                    <span className="row-time">{be.event.startAt ?? '—'}</span>
                    <Avatar member={be.owner} />
                    <div className="row-body">
                      <div className="row-title">{be.label}</div>
                      <div className="row-meta">
                        {be.masked && <span className="tag mask">詳細は本人だけ</span>}
                        {!be.masked && be.event.place && <span>{be.event.place}</span>}
                      </div>
                    </div>
                  </div>
                ))}

                {open.map((bt) => (
                  <div className="row" key={bt.task.id}>
                    <span className="row-time">{timeOf(bt.task.dueAt)}</span>
                    <Avatar member={bt.assignee} />
                    <div className="row-body">
                      <div className="row-title">{bt.task.title}</div>
                      <div className="row-meta">
                        {bt.unassigned ? (
                          <span className="tag unknown">担当未定</span>
                        ) : (
                          <span>{bt.assignee?.name}</span>
                        )}
                        {bt.task.source === 'ocr' && (
                          <span className="tag ocr">プリントから</span>
                        )}
                      </div>
                    </div>
                    {bt.unassigned && (
                      <span className="btn-group">
                        <button className="btn primary" onClick={() => claimTask(bt.task.id)}>
                          引き受ける
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      <div className="viewer">
        <span>いま見てる人:</span>
        {board.members.map((m) => (
          <button
            key={m.id}
            className="viewer-btn"
            aria-pressed={m.id === viewerId}
            onClick={() => setViewerId(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>

      <p className="note">
        {viewer && (
          <>
            {viewer.name}（{viewer.role}・
            {viewer.memberType === 'line'
              ? 'LINE接続'
              : viewer.memberType === 'muted'
                ? '通知オフ'
                : 'プロフィールのみ'}
            ）として表示中。人を切り替えると、他人のプライベート予定が抽象表示に変わる。
            <br />
          </>
        )}
        スプリント1のダミーデータ。保存はされません（リロードで戻る）。
      </p>
    </div>
  );
}

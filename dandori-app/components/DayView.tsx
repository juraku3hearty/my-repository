'use client';

import Avatar from './Avatar';
import DinnerCard from './DinnerCard';
import { timeOf } from '@/lib/date';
import type { BoardTask, DaySection, DinnerChoice } from '@/lib/types';

const KIND_LABEL: Record<string, string> = {
  prep: '準備',
  chore: '家事',
  pickup: '送迎'
};

function TaskRow({
  bt,
  viewerId,
  onClaim,
  onToggleDone
}: {
  bt: BoardTask;
  viewerId: string;
  onClaim: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
}) {
  const done = bt.task.status === 'done';
  const mine = bt.task.assigneeMemberId === viewerId;

  return (
    <div className="row">
      <span className="row-time">{timeOf(bt.task.dueAt)}</span>
      <Avatar member={bt.assignee} />
      <div className="row-body">
        <div className={`row-title${done ? ' done' : ''}`}>{bt.task.title}</div>
        <div className="row-meta">
          <span className="tag">{KIND_LABEL[bt.task.kind] ?? bt.task.kind}</span>
          {bt.task.source === 'ocr' && <span className="tag ocr">プリントから</span>}
          {bt.unassigned && <span className="tag unknown">担当未定</span>}
          {bt.overdue && !done && <span className="tag unknown">期限すぎ</span>}
          {bt.assignee && !bt.unassigned && <span>{bt.assignee.name}</span>}
        </div>
      </div>

      <span className="btn-group">
        {bt.unassigned && !done && (
          <button className="btn primary" onClick={() => onClaim(bt.task.id)}>
            引き受ける
          </button>
        )}
        {!bt.unassigned && !done && mine && (
          <button className="btn primary" onClick={() => onToggleDone(bt.task.id)}>
            やった
          </button>
        )}
        {!bt.unassigned && !done && !mine && (
          <button className="btn ghost" onClick={() => onToggleDone(bt.task.id)}>
            完了
          </button>
        )}
        {done && (
          <button className="btn ghost" onClick={() => onToggleDone(bt.task.id)}>
            戻す
          </button>
        )}
      </span>
    </div>
  );
}

export default function DayView({
  day,
  viewerId,
  onAnswer,
  onClaim,
  onToggleDone,
  showDinner = true
}: {
  day: DaySection;
  viewerId: string;
  onAnswer: (memberId: string, date: string, choice: DinnerChoice) => void;
  onClaim: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  showDinner?: boolean;
}) {
  const openTasks = day.tasks.filter((t) => t.task.status !== 'done');
  const doneTasks = day.tasks.filter((t) => t.task.status === 'done');

  return (
    <>
      {showDinner && (
        <DinnerCard
          dinner={day.dinner}
          dayLabel={day.label}
          viewerId={viewerId}
          onAnswer={onAnswer}
        />
      )}

      <div className="card">
        <h3 className="card-title">📌 やること</h3>
        {openTasks.length === 0 && doneTasks.length === 0 && (
          <p className="empty">この日は何もない。ゆっくりしとき</p>
        )}
        {openTasks.map((bt) => (
          <TaskRow
            key={bt.task.id}
            bt={bt}
            viewerId={viewerId}
            onClaim={onClaim}
            onToggleDone={onToggleDone}
          />
        ))}
        {doneTasks.map((bt) => (
          <TaskRow
            key={bt.task.id}
            bt={bt}
            viewerId={viewerId}
            onClaim={onClaim}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>

      <div className="card">
        <h3 className="card-title">📅 予定</h3>
        {day.events.length === 0 && <p className="empty">予定なし</p>}
        {day.events.map((be) => (
          <div className="row" key={be.event.id}>
            <span className="row-time">{be.event.startAt ?? '—'}</span>
            <Avatar member={be.owner} />
            <div className="row-body">
              <div className="row-title">{be.label}</div>
              <div className="row-meta">
                {be.owner && <span>{be.owner.name}</span>}
                {be.masked ? (
                  <span className="tag mask">詳細は本人だけ</span>
                ) : (
                  be.event.place && <span>{be.event.place}</span>
                )}
                {be.event.source === 'ocr' && <span className="tag ocr">プリントから</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

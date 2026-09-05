'use client';

import Avatar from './Avatar';
import type { DinnerChoice, DinnerSummary } from '@/lib/types';

export default function DinnerCard({
  dinner,
  dayLabel,
  viewerId,
  onAnswer
}: {
  dinner: DinnerSummary;
  dayLabel: string;
  viewerId: string;
  onAnswer: (memberId: string, date: string, choice: DinnerChoice) => void;
}) {
  return (
    <div className="card">
      <h3 className="card-title">
        🍚 {dayLabel}の夕飯
        {dinner.bentoMembers.length > 0 && (
          <span className="spacer">
            弁当 {dinner.bentoMembers.map((m) => m.name).join('・')}
          </span>
        )}
      </h3>

      <div className="dinner-count">
        <b>{dinner.countIn}</b>
        <span>人分</span>
        {dinner.countUnknown > 0 && (
          <span style={{ marginLeft: 8, color: 'var(--alert)', fontWeight: 600 }}>
            ＋未回答 {dinner.countUnknown}人
          </span>
        )}
      </div>

      {dinner.rows.map((row) => (
        <div className="dinner-row" key={row.member.id}>
          <Avatar member={row.member} />
          <span className="dinner-name">{row.member.name}</span>

          {row.choice === 'unknown' ? (
            <span className="btn-group" style={{ marginLeft: 'auto' }}>
              <button
                className="btn primary"
                onClick={() => onAnswer(row.member.id, dinner.date, 'in')}
              >
                いる
              </button>
              <button
                className="btn"
                onClick={() => onAnswer(row.member.id, dinner.date, 'out')}
              >
                いらん
              </button>
            </span>
          ) : (
            <span className="dinner-meta">
              {row.isException && <span className="tag">変更</span>}
              {row.bento && <span className="tag">弁当</span>}
              {row.homeBy && <span>{row.homeBy}</span>}
              <span className={`tag ${row.choice}`}>
                {row.choice === 'in' ? 'いる' : 'いらん'}
              </span>
              {/* 本人か、LINEを持たない子（親が代わりに答える）だけ変更できる */}
              {(row.member.id === viewerId || row.member.memberType === 'profile') && (
                <button
                  className="btn ghost"
                  style={{ padding: '2px 8px', fontSize: 11.5 }}
                  onClick={() =>
                    onAnswer(
                      row.member.id,
                      dinner.date,
                      row.choice === 'in' ? 'out' : 'in'
                    )
                  }
                >
                  変える
                </button>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

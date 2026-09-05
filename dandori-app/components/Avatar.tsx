import type { Member } from '@/lib/types';

export default function Avatar({ member, large }: { member: Member | null; large?: boolean }) {
  if (!member) {
    return (
      <span
        className={`avatar${large ? ' lg' : ''}`}
        style={{ background: 'transparent', border: '1px dashed var(--muted)', color: 'var(--muted)' }}
        title="担当未定"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={`avatar${large ? ' lg' : ''}`}
      style={{ background: member.color }}
      title={`${member.name}（${member.role}）`}
    >
      {member.shortName}
    </span>
  );
}

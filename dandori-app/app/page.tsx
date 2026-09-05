import Board from '@/components/Board';
import { buildSnapshot } from '@/lib/dummy';

// 「今日」を含むので毎リクエスト組み立てる
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; as?: string }>;
}) {
  const now = new Date();
  const sp = await searchParams;

  // スプリント2でLIFFログインが入ったら、ここで閲覧者を確定して
  //   maskSnapshotFor(snapshot, viewerId)
  // を通す。そうしないと他人のプライベート予定の本文がページのソースに残る。
  // いまは「誰として見るか」を切り替えられるようにするため、素のまま渡している。

  const snapshot = buildSnapshot(now);
  const initialTab =
    sp.tab === 'tomorrow' || sp.tab === 'week' ? sp.tab : 'today';
  const initialViewer =
    snapshot.members.find((m) => m.id === sp.as)?.id ?? snapshot.members[0].id;

  // 日付ずれ（サーバーUTC / 端末JST）を避けるため、基準時刻はサーバーで確定して渡す
  return (
    <Board
      snapshot={snapshot}
      nowIso={now.toISOString()}
      initialTab={initialTab}
      initialViewerId={initialViewer}
    />
  );
}

import type { CollectionUnlockAnnouncement } from "@/features/collections/lib/collection-unlock-announcement";

/**
 * `/api/collections/unlock-announcements` の先読みキャッシュ。
 *
 * 段階解放モーダル(B)は、進捗モーダルを閉じた直後(`COLLECTION_PROGRESS_DISMISSED_EVENT`)に
 * このエンドポイントを叩いてから表示するため、閉じてから数秒の体感待ちが発生していた。
 * 進捗モーダルの celebration が立った時点(ユーザーがまだモーダルを見ている間)で
 * バックグラウンド取得を始めておき、閉じた瞬間はその結果を再利用することで待ちを隠す。
 *
 * `useCollectionProgress`(celebration 表示時に prefetch を起動)と
 * `CollectionUnlockDripListener`(dismiss 時に消費)の橋渡し役。
 */

interface UnlockAnnouncementsResponse {
  announcements?: CollectionUnlockAnnouncement[];
}

interface PendingEntry {
  promise: Promise<UnlockAnnouncementsResponse>;
  startedAt: number;
}

// 先読み結果の使い回しを許容する最大経過時間。長時間放置された進捗モーダルの
// 解放状況が古いまま使われないよう、実用上十分短い値にする。
const MAX_REUSE_MS = 30_000;

let pending: PendingEntry | null = null;

function isFresh(entry: PendingEntry): boolean {
  return Date.now() - entry.startedAt < MAX_REUSE_MS;
}

function fetchAnnouncements(): Promise<UnlockAnnouncementsResponse> {
  return fetch("/api/collections/unlock-announcements", {
    cache: "no-store",
  }).then((res) => {
    if (!res.ok) throw new Error(`unlock-announcements fetch failed: ${res.status}`);
    return res.json() as Promise<UnlockAnnouncementsResponse>;
  });
}

/**
 * 進捗モーダル表示中にバックグラウンドで解放お知らせを先読みする(結果は呼び捨てでよい)。
 * 直近の先読みがまだ新しければ二重取得しない。
 */
export function prefetchUnlockAnnouncements(): void {
  if (pending && isFresh(pending)) return;
  const promise = fetchAnnouncements();
  const entry: PendingEntry = { promise, startedAt: Date.now() };
  pending = entry;
  promise.catch(() => {
    // 先読み失敗はここでは無視する。消費側の getUnlockAnnouncements が
    // (使い回し不可と判断して)自前で再取得する。
    if (pending === entry) pending = null;
  });
}

/**
 * 段階解放モーダル判定用に解放お知らせを取得する。
 * 直近の prefetch が有効ならそれを再利用し(先読み済みなら体感待ちほぼゼロ)、
 * 無ければその場で取得する(フォールバック、prefetch 前と同じ待ち時間)。
 */
export function getUnlockAnnouncements(): Promise<UnlockAnnouncementsResponse> {
  if (pending && isFresh(pending)) {
    const entry = pending;
    // 一度使ったら消費済みにする(次の celebration で改めて先読みさせる)。
    pending = null;
    return entry.promise;
  }
  return fetchAnnouncements();
}

/**
 * テスト専用: module スコープの先読みキャッシュをクリアする。
 * 本番コードから呼ばないこと(テストファイル間の状態リークを防ぐためだけに存在する)。
 */
export function resetUnlockAnnouncementsPrefetchForTests(): void {
  pending = null;
}

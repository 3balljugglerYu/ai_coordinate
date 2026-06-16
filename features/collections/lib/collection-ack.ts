/**
 * コレクション進捗の「最後に通知したユニーク種類数」(ack)を localStorage で管理する。
 *
 * 進捗モーダル/コンプリート演出(useCollectionProgress / CollectionProgressChecker)は
 * `ack < 現在のユニーク数` のときに発火し、表示時に ack を現在値へ進めて再表示を抑止する。
 *
 * 解放お知らせ(PetitUnlockAnnouncer)はこの ack を読み、前提カテゴリ(神コレ)のコンプリート
 * 演出が「まだ表示・確認されていない」間はお知らせを出さない(演出と重ねない)ために使う。
 */
export const COLLECTION_ACK_PREFIX = "collection-ack:";

export function getCollectionAck(categoryKey: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(COLLECTION_ACK_PREFIX + categoryKey);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setCollectionAck(categoryKey: string, count: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    COLLECTION_ACK_PREFIX + categoryKey,
    String(count),
  );
}

/**
 * 解放お知らせ(PetitUnlockAnnouncer)が「今モーダルを表示中か」を表す、極小の共有シグナル。
 *
 * ホームでは解放お知らせとポップアップバナーが同時に出得るため、解放お知らせを優先し、
 * 表示中はポップアップバナー側(usePopupBanner)を抑止するのに使う。useSyncExternalStore で
 * 購読する(React state ではなくモジュールスコープの外部ストア)。
 */
let active = false;
const listeners = new Set<() => void>();

export function setUnlockAnnouncerActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

export function subscribeUnlockAnnouncer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUnlockAnnouncerActive(): boolean {
  return active;
}

/** SSR/ハイドレーション中は常に false(localStorage 依存の表示判定はクライアントのみ)。 */
export function getUnlockAnnouncerActiveServer(): boolean {
  return false;
}

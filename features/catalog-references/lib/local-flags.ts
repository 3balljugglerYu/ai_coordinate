/**
 * 「先行公開」の案内を見たかの印を、本人ごとにこの端末(localStorage)に持つ。一度見せたら二度と出さない。
 * (有効な同意がサーバーにある人には、そもそも出さない。同意そのものはサーバーに残す)
 */
const INTRO_SEEN_KEY_PREFIX = "persta:catalog-reference-intro-seen-v1:";

function introSeenKey(userId: string): string {
  return `${INTRO_SEEN_KEY_PREFIX}${userId}`;
}

/** 読めないときは「見た」扱い(安全側)にし、繰り返し出さない */
export function hasSeenCatalogReferenceIntro(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(introSeenKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markCatalogReferenceIntroSeen(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(introSeenKey(userId), "1");
  } catch {
    // localStorage に書けなくても困らない。この画面のあいだは閉じたままになる
  }
}

/** ほかのタブで印が書かれたら知らせる(useSyncExternalStore の購読) */
export function subscribeCatalogReferenceFlags(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(INTRO_SEEN_KEY_PREFIX)) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

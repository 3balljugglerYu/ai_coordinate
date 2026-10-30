/**
 * 見本の「先行公開」の案内を一度見たかどうかを localStorage で持つ。一度見せたら二度と出さない。
 * (見本を前に上げたことがある人には、そもそも出さない。そちらはサーバーで確かめる)
 */
const STORAGE_KEY = "persta:catalog-reference-intro-seen-v1";

/** 読めないときは「見た」扱い(安全側)にし、繰り返し出さない */
export function hasSeenCatalogReferenceIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markCatalogReferenceIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage が使えなくても困らない。この画面のあいだは閉じたままになる
  }
}

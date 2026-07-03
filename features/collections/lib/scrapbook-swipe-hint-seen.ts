/**
 * スクラップブック(日記帳)ビューの「上スワイプで UI を隠せる」ヒントを
 * 一度見たかどうかを localStorage で管理する。一度見せたら二度と出さない。
 */
const STORAGE_KEY = "persta:scrapbook-swipe-hint-seen-v1";

/** 取得失敗時は「見た」扱い(安全側)にし、繰り返し表示しない。 */
export function hasSeenSwipeHint(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSwipeHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage 不可(プライベートモード等)でも致命ではない。ヒントが出ないだけ。
  }
}

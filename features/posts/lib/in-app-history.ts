"use client";

/**
 * このタブでアプリ内のページ遷移が起きたかを覚えておく。
 *
 * 「戻る」を履歴の巻き戻し(`router.back()`)にしてよいかの判定に使う。
 * 履歴が無い状態(共有リンクを新しいタブで開いた等)で `back()` すると
 * サイトの外へ出てしまうため、そのときは行き先を明示した遷移に倒す。
 *
 * `window.history.length` は前のサイトの履歴も数えてしまい当てにならないので、
 * アプリ自身が数える。sessionStorage なのでタブを閉じれば消える。
 */

const KEY = "persta-ai:in-app-navigations";

/** ページが表示されるたびに呼ぶ（初回表示も含む）。 */
export function recordInAppNavigation(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = Number.parseInt(
      window.sessionStorage.getItem(KEY) ?? "0",
      10
    );
    const next = Number.isSafeInteger(current) && current > 0 ? current + 1 : 1;
    window.sessionStorage.setItem(KEY, String(next));
  } catch {
    // sessionStorage が使えない環境では「履歴なし」として扱われる（安全側）
  }
}

/**
 * このタブでアプリ内を1回以上移動したか。
 *
 * 初回表示で 1 になるため、戻れるのは 2 以上のとき。
 */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const current = Number.parseInt(
      window.sessionStorage.getItem(KEY) ?? "0",
      10
    );
    return Number.isSafeInteger(current) && current >= 2;
  } catch {
    return false;
  }
}

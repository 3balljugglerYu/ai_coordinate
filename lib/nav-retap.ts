"use client";

/**
 * 既にそのタブにいる状態で、ナビゲーションを再タップしたときの挙動。
 *
 * ホームでは一番上へ戻す（一般的な SNS と同じ）。フィードは1件が縦に大きく、
 * 下まで見てから自力でスクロールし直すのは現実的でないため。
 *
 * @returns 再タップとして処理したら true（呼び出し側は遷移をしない）
 */
export function handleNavigationRetap(normalizedTargetPath: string): boolean {
  if (normalizedTargetPath !== "/") {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  // scroll-behavior: smooth が効く環境ではなめらかに戻る
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

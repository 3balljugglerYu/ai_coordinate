/**
 * /user-styles の計測イベント送信（クライアント）。
 *
 * ⭐ **既存の `/style/events` は使えない。** あちらの許可集合は
 * `visit / download / generate / signup_click / wardrobe_save_click` の固定5値で、
 * 未知の値は 400 になる。`recordStyleUsageEvent` 自体は `server-only`。
 * そのため専用の入口 `/api/user-styles/events` を叩く（計画書 レビュー#4）。
 *
 * ⭐ **計測は UX に影響させない。** 失敗しても握りつぶす。
 * 段階公開のフラグが無効なら 404 が返るが、それも無視してよい。
 */

/** チップ識別子。route 側の許可集合と揃えること。 */
export type UserStyleChipEvent = "all" | "usage" | "author";

function send(body: Record<string, unknown>): void {
  void fetch("/api/user-styles/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // 画面を離れる瞬間でも落とさない
    keepalive: true,
  }).catch(() => {
    // 計測の失敗で操作を止めない
  });
}

/** 訪問。ページのマウント時に1回だけ呼ぶ。 */
export function trackUserStyleVisit(): void {
  send({ eventType: "user_styles_visit" });
}

/**
 * チップ選択。
 *
 * 作者チップは作者IDごとに分けず `author` にまとめる
 * ── 誰を押したかではなく「作者チップという導線が使われたか」を見たいため。
 */
export function trackUserStyleChip(chip: UserStyleChipEvent): void {
  send({ eventType: "user_styles_chip", chip });
}

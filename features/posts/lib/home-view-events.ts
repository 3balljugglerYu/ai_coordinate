"use client";

import { isHomeViewMode, type HomeViewMode } from "./home-view-preference";

/**
 * ホームの表示形式の効果測定（ADR-003 / ADR-006）。
 *
 * 送信は best-effort。記録に失敗しても操作は絶対に止めない。
 *
 * ## 帰属の考え方
 *
 * 比較したいのは「どちらの表示がプロンプト利用に繋がるか」であって
 * 「カード上のボタンが押されたか」ではない。グリッドは CTA を持たず
 * 「一覧 → 詳細 → CTA」を経由するため、詳細画面で押された分も
 * **直前のホーム表示形式**へ帰属させないと不公平な比較になる。
 * そのために表示形式を sessionStorage で持ち回る。
 */

const ENDPOINT = "/api/posts/home-view-events";
const LAST_VIEW_MODE_KEY = "persta-ai:last-home-view-mode";
const VIEWED_MARK_PREFIX = "persta-ai:home-viewed:";

export type HomeViewEventType =
  | "home_viewed"
  | "view_mode_changed"
  | "prompt_use_tapped"
  | "follow_from_card";

/**
 * 帰属先の表示形式。
 *
 * `none` は「ホームを経由していない」ことを表す（共有リンク・プロフィール・通知・
 * 検索からそのまま詳細に来た場合）。これをグリッド扱いにすると、分母（ホームの
 * `home_viewed`）に対応しないタップが分子に混ざり、グリッドの到達率だけが
 * 水増しされて比較が壊れる。到達率の算出では `none` を除外する。
 */
export type AttributedViewMode = HomeViewMode | "none";

interface HomeViewEventPayload {
  event_type: HomeViewEventType;
  view_mode: AttributedViewMode;
  from_view_mode?: HomeViewMode;
  post_id?: string;
}

/** イベントを送る。失敗は握りつぶす（計測が操作を妨げてはならない）。 */
export function sendHomeViewEvent(payload: HomeViewEventPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const body = JSON.stringify(payload);
    // 離脱直前でも落とさないよう sendBeacon を優先する
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, body);
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // JSON 化も送信もできない環境では黙って諦める
  }
}

/**
 * 分母となる `home_viewed` を記録する。
 *
 * セッション内で表示形式ごとに1回だけ送る。スクロールやタブ移動のたびに
 * 数えると、長く見た人ほど分母が膨らんで率が歪む。
 */
export function trackHomeViewed(viewMode: HomeViewMode): void {
  if (typeof window === "undefined") {
    return;
  }
  rememberHomeViewMode(viewMode);
  try {
    const key = `${VIEWED_MARK_PREFIX}${viewMode}`;
    if (window.sessionStorage.getItem(key) === "1") {
      return;
    }
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage が使えない環境では重複を許容して送る(数えないより良い)
  }
  sendHomeViewEvent({ event_type: "home_viewed", view_mode: viewMode });
}

/** 表示形式の切り替えを記録する。 */
export function trackViewModeChanged(from: HomeViewMode, to: HomeViewMode): void {
  rememberHomeViewMode(to);
  sendHomeViewEvent({
    event_type: "view_mode_changed",
    view_mode: to,
    from_view_mode: from,
  });
}

/**
 * 「このプロンプトで作る」が押されたことを記録する。
 *
 * カード上・投稿詳細のどちらで押されても呼ぶ。表示形式は直前のホームのものを使う
 * （詳細画面はホームの表示形式を知らないため）。
 */
export function trackPromptUseTapped(postId: string): void {
  sendHomeViewEvent({
    event_type: "prompt_use_tapped",
    view_mode: getAttributedViewMode(),
    post_id: postId,
  });
}

/** カード経由のフォロー成立を記録する。 */
export function trackFollowFromCard(postId: string): void {
  sendHomeViewEvent({
    event_type: "follow_from_card",
    view_mode: getAttributedViewMode(),
    post_id: postId,
  });
}

/** 直前のホーム表示形式を覚える（詳細画面での帰属に使う）。 */
export function rememberHomeViewMode(viewMode: HomeViewMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(LAST_VIEW_MODE_KEY, viewMode);
  } catch {
    // 書けない環境では既定(グリッド)へ帰属する
  }
}

/**
 * 帰属に使う表示形式。
 *
 * ホームを経ずに詳細へ直接来た場合（共有リンク・プロフィール・通知・検索）は
 * `none` を返す。**既定のグリッドへ倒してはいけない**。分母の `home_viewed` は
 * ホームでしか発生しないので、ホーム外からのタップをグリッドに数えると
 * グリッドの到達率だけが水増しされ、表示形式の比較が成立しなくなる。
 */
export function getAttributedViewMode(): AttributedViewMode {
  if (typeof window === "undefined") {
    return "none";
  }
  try {
    const value = window.sessionStorage.getItem(LAST_VIEW_MODE_KEY);
    return isHomeViewMode(value) ? value : "none";
  } catch {
    return "none";
  }
}

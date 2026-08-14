/**
 * ホームの「表示形式」(グリッド / フィード)を端末に記憶するための軽量な永続化ヘルパー。
 *
 * 用途:
 *  - HomeViewToggle が押下時に保存する
 *  - PostList がマウント時に読み取り、Masonry と 1列フィードを切り替える
 *
 * 設計(ADR-002): 未ログインでもホームは閲覧できるため、サーバー保存ではなく
 * localStorage に持つ。読み取り失敗(プライベートモード等)や SSR では既定値を返す。
 *
 * **既定は 2026-08-14 にフィードへ変更した**。グリッドのままでは
 * 29人中4人しかフィードを見ておらず、良し悪しの判断そのものができなかったため
 * (計画書: docs/planning/home-feed-default-switch-implementation-plan.md)。
 *
 * NEW バッジ: 既定がフィードになった今は「新しい表示形式がある」ことを
 * 知らせる意味が無いので、出さない。切替の案内はスポットライトが担う。
 */
export const HOME_VIEW_MODES = {
  grid: "grid",
  feed: "feed",
} as const;

export type HomeViewMode = (typeof HOME_VIEW_MODES)[keyof typeof HOME_VIEW_MODES];

const STORAGE_KEY = "persta-ai:home-view-mode";
const NEW_BADGE_SEEN_KEY = "persta-ai:home-feed-badge-seen";
/**
 * 切替の案内を出したか。**表示形式とは別のキーに持つ**。
 * 同じキーに混ぜると「保存済みか」と「案内済みか」が区別できない。
 * もう一度案内したくなったら `-v2` にすれば再実行できる。
 */
const SWITCH_NOTICE_SEEN_KEY = "persta-ai:home-view-switch-notice-v1";

export const DEFAULT_HOME_VIEW_MODE: HomeViewMode = HOME_VIEW_MODES.feed;

/**
 * NEW バッジの表示期限(この日時を過ぎたら誰にも出さない)。
 * 恒久的に「NEW」が残ると意味を失うため、公開からおよそ1か月で自動的に消す。
 */
export const HOME_FEED_NEW_BADGE_DEADLINE = Date.parse("2026-09-30T23:59:59+09:00");

/** 与えられた値が表示形式かどうか。 */
export function isHomeViewMode(value: string | null | undefined): value is HomeViewMode {
  return value === HOME_VIEW_MODES.grid || value === HOME_VIEW_MODES.feed;
}

/** 端末に記憶された表示形式を返す(未保存・失敗時はグリッド)。 */
export function getHomeViewMode(): HomeViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_HOME_VIEW_MODE;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isHomeViewMode(value) ? value : DEFAULT_HOME_VIEW_MODE;
  } catch {
    return DEFAULT_HOME_VIEW_MODE;
  }
}

/** 表示形式を端末に保存する。 */
export function setHomeViewMode(mode: HomeViewMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage に書けない環境(プライベートモード等)では黙ってスキップ
  }
}

/**
 * NEW バッジを出すべきか。
 *
 * **既定をフィードにしたので、常に false**。
 * 「新しい表示形式があります」と知らせる対象が既定になったため意味を失った。
 * 呼び出し側と既存テストを残したまま無効化できるよう、関数自体は残す。
 */
export function shouldShowHomeFeedNewBadge(): boolean {
  return false;
}

/**
 * 切替の案内をこの端末でまだ出していないか。
 *
 * localStorage が使えない環境では **false**(出さない)。読めないと毎回
 * 「見ていない」と判定され、訪れるたびにスポットライトが出てしまうため。
 */
export function shouldShowHomeViewSwitchNotice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(SWITCH_NOTICE_SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

/** 切替の案内を出し終えた(以後は出さない)。 */
export function markHomeViewSwitchNoticeSeen(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SWITCH_NOTICE_SEEN_KEY, "1");
  } catch {
    // 書けない環境では shouldShow... 側が false を返すので、出続けることはない
  }
}

/** NEW バッジを既読にする(フィードを表示したタイミングで呼ぶ)。 */
export function markHomeFeedNewBadgeSeen(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(NEW_BADGE_SEEN_KEY, "1");
  } catch {
    // 書けない環境では毎回バッジが出るが、実害はないので黙ってスキップ
  }
}

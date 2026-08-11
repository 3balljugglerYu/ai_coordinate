/**
 * ホームの「表示形式」(グリッド / フィード)を端末に記憶するための軽量な永続化ヘルパー。
 *
 * 用途:
 *  - HomeViewToggle が押下時に保存する
 *  - PostList がマウント時に読み取り、Masonry と 1列フィードを切り替える
 *
 * 設計(ADR-002): 未ログインでもホームは閲覧できるため、サーバー保存ではなく
 * localStorage に持つ。読み取り失敗(プライベートモード等)や SSR では既定値
 * (グリッド)を返す。既定をグリッドに据え置くのは ADR-004 の決定による。
 *
 * NEW バッジ: トグルは小さく放置すると気づかれないため、初回のフィード表示までは
 * バッジを出す。一度でもフィードを見たら消し、公開から一定期間で自動的に消える。
 */
export const HOME_VIEW_MODES = {
  grid: "grid",
  feed: "feed",
} as const;

export type HomeViewMode = (typeof HOME_VIEW_MODES)[keyof typeof HOME_VIEW_MODES];

const STORAGE_KEY = "persta-ai:home-view-mode";
const NEW_BADGE_SEEN_KEY = "persta-ai:home-feed-badge-seen";

export const DEFAULT_HOME_VIEW_MODE: HomeViewMode = HOME_VIEW_MODES.grid;

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
 * 一度でもフィードを見た端末、または表示期限を過ぎている場合は出さない。
 */
export function shouldShowHomeFeedNewBadge(now: number): boolean {
  if (now > HOME_FEED_NEW_BADGE_DEADLINE) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(NEW_BADGE_SEEN_KEY) !== "1";
  } catch {
    return false;
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

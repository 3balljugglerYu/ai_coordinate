/**
 * @jest-environment node
 *
 * PostList はサーバーでもレンダーされるため、window が無い環境でも
 * 例外を投げずに既定値へ倒れることを保証する。
 */
import {
  getHomeViewMode,
  HOME_FEED_NEW_BADGE_DEADLINE,
  HOME_VIEW_MODES,
  markHomeFeedNewBadgeSeen,
  setHomeViewMode,
  shouldShowHomeFeedNewBadge,
} from "@/features/posts/lib/home-view-preference";

describe("home-view-preference (SSR)", () => {
  test("window が無くても既定のグリッドを返す", () => {
    expect(typeof window).toBe("undefined");
    expect(getHomeViewMode()).toBe("grid");
  });

  test("保存系は何もせず例外も投げない", () => {
    expect(() => setHomeViewMode(HOME_VIEW_MODES.feed)).not.toThrow();
    expect(() => markHomeFeedNewBadgeSeen()).not.toThrow();
  });

  test("NEW バッジはサーバー側では出さない(ハイドレーション不一致を避ける)", () => {
    expect(shouldShowHomeFeedNewBadge(HOME_FEED_NEW_BADGE_DEADLINE - 1)).toBe(false);
  });
});

/**
 * ナビゲーション再タップの挙動のテスト。
 *
 * ここが誤ると、ホームで下まで見た人が一番上へ戻る手段を失う（または
 * ホーム以外のタブで意図せずスクロール位置が飛ぶ）。
 */

import { handleNavigationRetap } from "@/lib/nav-retap";

describe("handleNavigationRetap", () => {
  let scrollTo: jest.Mock;

  beforeEach(() => {
    scrollTo = jest.fn();
    Object.defineProperty(window, "scrollTo", {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
  });

  test("ホームの再タップは一番上へ戻し_遷移させない", () => {
    expect(handleNavigationRetap("/")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  test.each(["/coordinate", "/style", "/challenge", "/notifications", "/my-page"])(
    "ホーム以外(%s)では何もしない",
    (path) => {
      expect(handleNavigationRetap(path)).toBe(false);
      expect(scrollTo).not.toHaveBeenCalled();
    }
  );
});

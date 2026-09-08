/**
 * @jest-environment node
 *
 * PostList はサーバーでもレンダーされるため、window が無い環境でも
 * 例外を投げずに「保存なし」へ倒れることを保証する。
 */
import {
  clearHomeSortType,
  getHomeSortType,
  setHomeSortType,
} from "@/features/posts/lib/home-sort-preference";

describe("home-sort-preference (SSR)", () => {
  test("window が無ければ null を返す(既定タブで描画される)", () => {
    expect(typeof window).toBe("undefined");
    expect(getHomeSortType()).toBeNull();
  });

  test("保存系は何もせず例外も投げない", () => {
    expect(() => setHomeSortType("newest")).not.toThrow();
    expect(() => clearHomeSortType()).not.toThrow();
  });
});

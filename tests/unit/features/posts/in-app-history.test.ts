/**
 * 「戻る」を履歴の巻き戻しにしてよいかの判定のテスト。
 *
 * ここが誤ると (a) 履歴が無いタブでサイトの外へ出てしまう、
 * (b) 逆に、戻れるのにスクロールが一番上へ戻される、のどちらかが起きる。
 */

import {
  hasInAppHistory,
  recordInAppNavigation,
} from "@/features/posts/lib/in-app-history";

describe("in-app-history", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test("何も記録していなければ戻れない", () => {
    expect(hasInAppHistory()).toBe(false);
  });

  test("初回表示だけでは戻れない(共有リンクを直接開いた場合)", () => {
    recordInAppNavigation();
    expect(hasInAppHistory()).toBe(false);
  });

  test("アプリ内で1回移動したら戻れる", () => {
    recordInAppNavigation(); // 初回表示
    recordInAppNavigation(); // 詳細へ移動
    expect(hasInAppHistory()).toBe(true);
  });

  test("壊れた保存値は初回表示として扱う", () => {
    window.sessionStorage.setItem("persta-ai:in-app-navigations", "abc");
    expect(hasInAppHistory()).toBe(false);

    recordInAppNavigation();
    expect(hasInAppHistory()).toBe(false);

    recordInAppNavigation();
    expect(hasInAppHistory()).toBe(true);
  });

  test("sessionStorage が使えなくても例外を投げず_戻れない側に倒す", () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });

    expect(() => recordInAppNavigation()).not.toThrow();
    expect(hasInAppHistory()).toBe(false);

    Object.defineProperty(window, "sessionStorage", {
      value: original,
      configurable: true,
    });
  });
});

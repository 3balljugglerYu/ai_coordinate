import {
  DEFAULT_HOME_VIEW_MODE,
  getHomeViewMode,
  HOME_FEED_NEW_BADGE_DEADLINE,
  HOME_VIEW_MODES,
  isHomeViewMode,
  markHomeFeedNewBadgeSeen,
  setHomeViewMode,
  shouldShowHomeFeedNewBadge,
} from "@/features/posts/lib/home-view-preference";

describe("home-view-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("未保存時の既定はグリッド(既存ユーザーの画面を変えない)", () => {
    expect(DEFAULT_HOME_VIEW_MODE).toBe(HOME_VIEW_MODES.grid);
    expect(getHomeViewMode()).toBe("grid");
  });

  test("保存した表示形式を返す", () => {
    setHomeViewMode(HOME_VIEW_MODES.feed);
    expect(getHomeViewMode()).toBe("feed");
    setHomeViewMode(HOME_VIEW_MODES.grid);
    expect(getHomeViewMode()).toBe("grid");
  });

  test("不正な保存値は既定のグリッドに倒す", () => {
    window.localStorage.setItem("persta-ai:home-view-mode", "carousel");
    expect(getHomeViewMode()).toBe("grid");
  });

  test("isHomeViewMode は grid / feed のみ真", () => {
    expect(isHomeViewMode("grid")).toBe(true);
    expect(isHomeViewMode("feed")).toBe(true);
    expect(isHomeViewMode("list")).toBe(false);
    expect(isHomeViewMode(null)).toBe(false);
    expect(isHomeViewMode(undefined)).toBe(false);
  });

  describe("NEW バッジ", () => {
    const beforeDeadline = HOME_FEED_NEW_BADGE_DEADLINE - 1;

    test("未読かつ期限内なら表示する", () => {
      expect(shouldShowHomeFeedNewBadge(beforeDeadline)).toBe(true);
    });

    test("一度フィードを見たら表示しない", () => {
      markHomeFeedNewBadgeSeen();
      expect(shouldShowHomeFeedNewBadge(beforeDeadline)).toBe(false);
    });

    test("表示期限を過ぎたら未読でも表示しない", () => {
      expect(shouldShowHomeFeedNewBadge(HOME_FEED_NEW_BADGE_DEADLINE + 1)).toBe(false);
    });
  });

  describe("localStorage が使えない環境", () => {
    const original = window.localStorage;

    afterEach(() => {
      Object.defineProperty(window, "localStorage", {
        value: original,
        configurable: true,
      });
    });

    function breakLocalStorage() {
      Object.defineProperty(window, "localStorage", {
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
    }

    test("読み書きが失敗しても例外を投げず既定に倒す", () => {
      breakLocalStorage();
      expect(getHomeViewMode()).toBe("grid");
      expect(() => setHomeViewMode(HOME_VIEW_MODES.feed)).not.toThrow();
      expect(() => markHomeFeedNewBadgeSeen()).not.toThrow();
      // 既読かどうかを判定できないため、バッジは出さない側に倒す
      expect(shouldShowHomeFeedNewBadge(HOME_FEED_NEW_BADGE_DEADLINE - 1)).toBe(false);
    });
  });
});

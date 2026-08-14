import {
  DEFAULT_HOME_VIEW_MODE,
  getHomeViewMode,
  HOME_FEED_NEW_BADGE_DEADLINE,
  HOME_VIEW_MODES,
  isHomeViewMode,
  markHomeFeedNewBadgeSeen,
  setHomeViewMode,
  shouldShowHomeFeedNewBadge,
  shouldShowHomeViewSwitchNotice,
  markHomeViewSwitchNoticeSeen,
  shouldForceFeedView,
  markForcedFeedView,
} from "@/features/posts/lib/home-view-preference";

describe("home-view-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("未保存時の既定はフィード(2026-08-14に切替)", () => {
    // グリッドのままでは29人中4人しかフィードを見ておらず、
    // 良し悪しの判断そのものができなかったため既定を変えた
    expect(DEFAULT_HOME_VIEW_MODE).toBe(HOME_VIEW_MODES.feed);
    expect(getHomeViewMode()).toBe("feed");
  });

  test("保存した表示形式を返す", () => {
    setHomeViewMode(HOME_VIEW_MODES.feed);
    expect(getHomeViewMode()).toBe("feed");
    setHomeViewMode(HOME_VIEW_MODES.grid);
    expect(getHomeViewMode()).toBe("grid");
  });

  test("不正な保存値は既定のフィードに倒す", () => {
    window.localStorage.setItem("persta-ai:home-view-mode", "carousel");
    expect(getHomeViewMode()).toBe("feed");
  });

  test("isHomeViewMode は grid / feed のみ真", () => {
    expect(isHomeViewMode("grid")).toBe(true);
    expect(isHomeViewMode("feed")).toBe(true);
    expect(isHomeViewMode("list")).toBe(false);
    expect(isHomeViewMode(null)).toBe(false);
    expect(isHomeViewMode(undefined)).toBe(false);
  });

  describe("NEW バッジ", () => {
    test("既定がフィードになったので、もう出さない", () => {
      // 「新しい表示形式があります」と知らせる対象が既定になったため、
      // バッジの意味が無くなった。切替の案内はスポットライトが担う
      expect(shouldShowHomeFeedNewBadge(HOME_FEED_NEW_BADGE_DEADLINE - 1)).toBe(
        false
      );
    });
  });

  describe("強制切替", () => {
    test("未実施なら切り替える・一度実施したら切り替えない", () => {
      expect(shouldForceFeedView()).toBe(true);
      markForcedFeedView();
      expect(shouldForceFeedView()).toBe(false);
    });

    test("案内フラグとは独立している", () => {
      // 案内は他のモーダルが開いていると出せず次回へ持ち越す。
      // 同じフラグで判定すると、出せなかった端末を毎回上書きしてしまう
      markHomeViewSwitchNoticeSeen();
      expect(shouldForceFeedView()).toBe(true);
    });
  });

  describe("切替の案内", () => {
    test("未表示なら出す・一度出したら出さない", () => {
      expect(shouldShowHomeViewSwitchNotice()).toBe(true);
      markHomeViewSwitchNoticeSeen();
      expect(shouldShowHomeViewSwitchNotice()).toBe(false);
    });

    test("表示形式のキーとは独立している", () => {
      // 同じキーに混ぜると「保存済みか」と「案内済みか」を区別できない
      setHomeViewMode(HOME_VIEW_MODES.grid);
      expect(shouldShowHomeViewSwitchNotice()).toBe(true);
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
      expect(getHomeViewMode()).toBe("feed");
      expect(() => setHomeViewMode(HOME_VIEW_MODES.feed)).not.toThrow();
      expect(() => markHomeFeedNewBadgeSeen()).not.toThrow();
      expect(shouldShowHomeFeedNewBadge(HOME_FEED_NEW_BADGE_DEADLINE - 1)).toBe(false);
      // 読めない環境で「未表示」と判定すると、訪れるたびに案内が出てしまう
      expect(() => markHomeViewSwitchNoticeSeen()).not.toThrow();
      expect(shouldShowHomeViewSwitchNotice()).toBe(false);
      // 判定できないまま上書きすると、毎回ユーザーの選択を奪うことになる
      expect(() => markForcedFeedView()).not.toThrow();
      expect(shouldForceFeedView()).toBe(false);
    });
  });
});

/**
 * 表示形式の効果測定のテスト（ADR-006）。
 *
 * ここが誤ると (a) 分母が膨らんで率が歪む、(b) 詳細画面での CTA が
 * グリッドへ帰属されずフィード有利に偏る、(c) 計測の失敗が操作を止める、
 * のいずれかが起きる。
 */

import {
  getAttributedViewMode,
  rememberHomeViewMode,
  sendHomeViewEvent,
  trackFollowFromCard,
  trackHomeViewed,
  trackPromptUseTapped,
  trackViewModeChanged,
} from "@/features/posts/lib/home-view-events";

const ENDPOINT = "/api/posts/home-view-events";

/** sendBeacon に渡された payload を取り出す。 */
function sentPayloads(beacon: jest.Mock): Record<string, unknown>[] {
  return beacon.mock.calls.map((call) => JSON.parse(String(call[1])));
}

describe("home-view-events", () => {
  let beacon: jest.Mock;

  beforeEach(() => {
    window.sessionStorage.clear();
    beacon = jest.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
  });

  test("イベントは sendBeacon で送る(離脱直前でも落とさない)", () => {
    sendHomeViewEvent({ event_type: "home_viewed", view_mode: "feed" });

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(ENDPOINT);
    expect(sentPayloads(beacon)[0]).toEqual({
      event_type: "home_viewed",
      view_mode: "feed",
    });
  });

  describe("trackHomeViewed(分母)", () => {
    test("セッション内では表示形式ごとに1回だけ送る", () => {
      trackHomeViewed("grid");
      trackHomeViewed("grid");
      trackHomeViewed("grid");

      expect(beacon).toHaveBeenCalledTimes(1);
    });

    test("表示形式が違えばそれぞれ1回ずつ送る", () => {
      trackHomeViewed("grid");
      trackHomeViewed("feed");

      expect(sentPayloads(beacon).map((p) => p.view_mode)).toEqual(["grid", "feed"]);
    });

    test("帰属用の表示形式も同時に覚える", () => {
      trackHomeViewed("feed");
      expect(getAttributedViewMode()).toBe("feed");
    });
  });

  test("trackViewModeChanged は遷移元を付ける", () => {
    trackViewModeChanged("grid", "feed");

    expect(sentPayloads(beacon)[0]).toEqual({
      event_type: "view_mode_changed",
      view_mode: "feed",
      from_view_mode: "grid",
    });
  });

  describe("分子の帰属", () => {
    test("直前のホーム表示形式へ帰属させる(詳細画面で押されても同じ)", () => {
      rememberHomeViewMode("feed");

      trackPromptUseTapped("post-1");

      expect(sentPayloads(beacon)[0]).toEqual({
        event_type: "prompt_use_tapped",
        view_mode: "feed",
        post_id: "post-1",
      });
    });

    test("ホームを経ずに詳細へ直接来た場合は none(グリッドに数えない)", () => {
      // 共有リンク・プロフィール・通知・検索からの流入。グリッドへ倒すと
      // 分母(home_viewed)に対応しないタップが分子に混ざり、到達率が水増しされる
      trackPromptUseTapped("post-1");

      expect(getAttributedViewMode()).toBe("none");
      expect(sentPayloads(beacon)[0].view_mode).toBe("none");
    });

    test("不正な保存値も none へ倒す", () => {
      window.sessionStorage.setItem("persta-ai:last-home-view-mode", "carousel");
      expect(getAttributedViewMode()).toBe("none");
    });

    test("follow_from_card も同じ帰属で記録する", () => {
      rememberHomeViewMode("feed");

      trackFollowFromCard("post-2");

      expect(sentPayloads(beacon)[0]).toEqual({
        event_type: "follow_from_card",
        view_mode: "feed",
        post_id: "post-2",
      });
    });
  });

  describe("失敗しても操作を止めない", () => {
    test("sendBeacon が例外を投げても投げ返さない", () => {
      Object.defineProperty(navigator, "sendBeacon", {
        value: () => {
          throw new Error("blocked");
        },
        configurable: true,
        writable: true,
      });

      expect(() => trackHomeViewed("feed")).not.toThrow();
    });

    test("sendBeacon が無い環境では fetch にフォールバックする", () => {
      Object.defineProperty(navigator, "sendBeacon", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const fetchMock = jest.fn(() => Promise.reject(new Error("offline")));
      global.fetch = fetchMock as unknown as typeof fetch;

      expect(() => trackHomeViewed("feed")).not.toThrow();
      expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({
        method: "POST",
        keepalive: true,
      }));
    });

    test("sessionStorage が使えなくても送信は続ける(数えないより良い)", () => {
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

      expect(() => trackHomeViewed("feed")).not.toThrow();
      expect(beacon).toHaveBeenCalledTimes(1);

      Object.defineProperty(window, "sessionStorage", {
        value: original,
        configurable: true,
      });
    });
  });
});

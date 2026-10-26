/**
 * 画面から送る関数。同じ訪問の中では、同じ key で1回だけ送る。送れなくても投げない。
 */

import { trackMonetizationEventOnce } from "@/features/monetization/lib/track-monetization-event";

describe("trackMonetizationEventOnce", () => {
  const fetchMock = jest.fn(() => Promise.resolve(new Response(null, { status: 200 })));

  beforeEach(() => {
    window.sessionStorage.clear();
    fetchMock.mockClear();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test("最初の1回だけ送り、同じ key の2回目は送らない", () => {
    trackMonetizationEventOnce("percoin_shortage:generate", { eventType: "percoin_shortage", feature: "generate" });
    trackMonetizationEventOnce("percoin_shortage:generate", { eventType: "percoin_shortage", feature: "generate" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/monetization-events",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  test("key が違えば、それぞれ送る", () => {
    trackMonetizationEventOnce("purchase_view:purchase_page", { eventType: "purchase_view", origin: "purchase_page" });
    trackMonetizationEventOnce("purchase_view:my_page", { eventType: "purchase_view", origin: "my_page" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("送れなくても投げない", () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(() =>
      trackMonetizationEventOnce("purchase_view:x", { eventType: "purchase_view" }),
    ).not.toThrow();
  });

  test("sessionStorage が使えなくても送る(上限は DB が数える)", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    trackMonetizationEventOnce("purchase_view:y", { eventType: "purchase_view" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

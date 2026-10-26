/**
 * 画面から送る関数。同じ訪問の中では、同じ key で1回だけ送る。送れなくても投げない。
 * 「送った」と覚えるのは 2xx のときだけ(未ログインの 401 などでは覚えない)。
 */

import { trackMonetizationEventOnce } from "@/features/monetization/lib/track-monetization-event";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("trackMonetizationEventOnce", () => {
  const fetchMock = jest.fn(() => Promise.resolve(({ ok: true, status: 200 } as Response)));

  beforeEach(() => {
    window.sessionStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(({ ok: true, status: 200 } as Response)));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  test("送れたら覚えて、同じ key の2回目は送らない", async () => {
    trackMonetizationEventOnce("percoin_shortage:generate", { eventType: "percoin_shortage", feature: "generate" });
    await flush();
    trackMonetizationEventOnce("percoin_shortage:generate", { eventType: "percoin_shortage", feature: "generate" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/monetization-events",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  test("送っている最中の2回目は送らない", async () => {
    trackMonetizationEventOnce("purchase_view:a", { eventType: "purchase_view" });
    trackMonetizationEventOnce("purchase_view:a", { eventType: "purchase_view" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("401(未ログイン)のときは覚えず、あとでもう一度送れる", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(({ ok: false, status: 401 } as Response)));
    trackMonetizationEventOnce("purchase_view:purchase_page", { eventType: "purchase_view" });
    await flush();
    trackMonetizationEventOnce("purchase_view:purchase_page", { eventType: "purchase_view" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("key が違えば、それぞれ送る", async () => {
    trackMonetizationEventOnce("purchase_view:purchase_page", { eventType: "purchase_view", origin: "purchase_page" });
    trackMonetizationEventOnce("purchase_view:my_page", { eventType: "purchase_view", origin: "my_page" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("送れなくても投げず、覚えない", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(() => trackMonetizationEventOnce("purchase_view:x", { eventType: "purchase_view" })).not.toThrow();
    await flush();
    trackMonetizationEventOnce("purchase_view:x", { eventType: "purchase_view" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("sessionStorage が使えなくても送る(上限は DB が数える)", async () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    trackMonetizationEventOnce("purchase_view:y", { eventType: "purchase_view" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

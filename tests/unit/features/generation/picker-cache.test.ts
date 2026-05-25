/**
 * @jest-environment jsdom
 *
 * picker-cache のキャッシュ/in-flight/prefetch 挙動をテスト。
 * 既存テストでカバーされない line 109 (prefetchGeneratedFirstPage の
 * early-return / catch) と line 118 (prefetchStockFirstPage の early-return /
 * catch) を埋める。
 */

const getSourceImageStocksMock = jest.fn();
jest.mock("@/features/generation/lib/database", () => ({
  getSourceImageStocks: (...args: unknown[]) =>
    getSourceImageStocksMock(...args),
}));

import {
  clearGeneratedCache,
  clearStockCache,
  fetchGeneratedFirstPage,
  fetchStockFirstPage,
  getCachedGeneratedFirstPage,
  getCachedStockFirstPage,
  prefetchAll,
  prefetchGeneratedFirstPage,
  prefetchStockFirstPage,
} from "@/features/generation/lib/picker-cache";

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
  clearGeneratedCache();
  clearStockCache();
  getSourceImageStocksMock.mockReset();
});

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe("picker-cache", () => {
  test("fetchGeneratedFirstPage 成功で cache に書き込み", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            kind: "generated",
            id: "g-1",
            imageUrl: "https://x/a.png",
            storagePath: "u/a.png",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
        ],
        nextOffset: null,
      }),
    );
    const data = await fetchGeneratedFirstPage();
    expect(data.items).toHaveLength(1);
    expect(getCachedGeneratedFirstPage()?.items[0]?.id).toBe("g-1");
  });

  test("fetchGeneratedFirstPage 並行呼び出しは in-flight を dedup する", async () => {
    let resolveFn: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const p1 = fetchGeneratedFirstPage();
    const p2 = fetchGeneratedFirstPage();
    resolveFn(jsonResponse({ items: [], nextOffset: null }));
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("fetchGeneratedFirstPage HTTP エラーは throw", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);
    await expect(fetchGeneratedFirstPage()).rejects.toThrow(/HTTP 500/);
  });

  test("prefetchGeneratedFirstPage は cache 既存なら early-return", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextOffset: null }),
    );
    await fetchGeneratedFirstPage(); // cache を作る
    await prefetchGeneratedFirstPage(); // early-return
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("prefetchGeneratedFirstPage 失敗時は console.warn のみ (throw しない)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(prefetchGeneratedFirstPage()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("fetchStockFirstPage 成功で cache に書き込み", async () => {
    getSourceImageStocksMock.mockResolvedValueOnce([
      {
        id: "s-1",
        user_id: "u",
        image_url: "https://x/s.png",
        storage_path: "p/s.png",
        name: "stock-1",
      },
    ]);
    const data = await fetchStockFirstPage();
    expect(data.stocks).toHaveLength(1);
    expect(getCachedStockFirstPage()?.stocks[0]?.id).toBe("s-1");
  });

  test("prefetchStockFirstPage は cache 既存なら early-return", async () => {
    getSourceImageStocksMock.mockResolvedValueOnce([]);
    await fetchStockFirstPage();
    await prefetchStockFirstPage();
    expect(getSourceImageStocksMock).toHaveBeenCalledTimes(1);
  });

  test("prefetchStockFirstPage 失敗時は console.warn のみ", async () => {
    getSourceImageStocksMock.mockRejectedValueOnce(new Error("rpc down"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(prefetchStockFirstPage()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("prefetchAll は両方を呼ぶ", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextOffset: null }),
    );
    getSourceImageStocksMock.mockResolvedValueOnce([]);
    await prefetchAll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSourceImageStocksMock).toHaveBeenCalledTimes(1);
  });
});

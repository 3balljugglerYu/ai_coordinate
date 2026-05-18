/** @jest-environment node */

import { bulkDeleteMyImages } from "@/features/my-page/lib/api";

// `bulkDeleteMyImages` は fetch 直接呼び出しのみで、Supabase クライアントは使わない。
// jsdom ではなく node 環境で動かして fetch のグローバル差し替えだけで完結させる。

function buildFetchResponse(opts: {
  ok: boolean;
  status?: number;
  jsonResult: unknown | Error;
}): Response {
  const json = jest.fn(() =>
    opts.jsonResult instanceof Error
      ? Promise.reject(opts.jsonResult)
      : Promise.resolve(opts.jsonResult),
  );
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    json,
  } as unknown as Response;
}

describe("bulkDeleteMyImages", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test("成功時_DELETE /api/my-page/images へ imageIds を送り deleted/failed をそのまま返す", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      buildFetchResponse({
        ok: true,
        jsonResult: { deleted: ["a", "b"], failed: ["c"] },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await bulkDeleteMyImages(["a", "b", "c"]);

    expect(fetchMock).toHaveBeenCalledWith("/api/my-page/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: ["a", "b", "c"] }),
    });
    expect(result).toEqual({ deleted: ["a", "b"], failed: ["c"] });
  });

  test("成功時_レスポンスに deleted/failed 配列が欠けていても空配列にフォールバックする", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildFetchResponse({ ok: true, jsonResult: {} }),
    ) as unknown as typeof fetch;

    const result = await bulkDeleteMyImages(["a"]);

    expect(result).toEqual({ deleted: [], failed: [] });
  });

  test("ok=false_かつエラーボディに error が含まれる場合_そのメッセージで throw する", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildFetchResponse({
        ok: false,
        status: 400,
        jsonResult: { error: "削除対象の指定が不正です" },
      }),
    ) as unknown as typeof fetch;

    await expect(bulkDeleteMyImages(["a"])).rejects.toThrow(
      "削除対象の指定が不正です",
    );
  });

  test("ok=false_エラーボディが error を含まない場合_messages.bulkDeleteFailed が優先される", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildFetchResponse({ ok: false, jsonResult: {} }),
    ) as unknown as typeof fetch;

    await expect(
      bulkDeleteMyImages(["a"], { bulkDeleteFailed: "Failed (override)" }),
    ).rejects.toThrow("Failed (override)");
  });

  test("ok=false_エラーボディの JSON parse に失敗してもデフォルト日本語メッセージで throw する", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildFetchResponse({
        ok: false,
        jsonResult: new Error("invalid json"),
      }),
    ) as unknown as typeof fetch;

    await expect(bulkDeleteMyImages(["a"])).rejects.toThrow(
      "画像の一括削除に失敗しました",
    );
  });
});

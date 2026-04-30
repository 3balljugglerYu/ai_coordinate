/** @jest-environment jsdom */

import { linkSourceImageStockToJobs } from "@/features/generation/lib/database";
import { COORDINATE_STOCKS_LINK_MAX_JOBS } from "@/features/generation/lib/coordinate-stocks-constants";

describe("linkSourceImageStockToJobs chunking", () => {
  const stockId = "stock-1";

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("jobIds が 0 件のときは fetch を呼ばずに空結果を返す", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await linkSourceImageStockToJobs(stockId, []);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      updatedJobIds: [],
      updatedGeneratedImageIds: [],
    });
  });

  it("jobIds が上限以内なら 1 回の PATCH で完結する", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        updatedJobIds: ["j1", "j2"],
        updatedGeneratedImageIds: ["g1"],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const jobIds = ["j1", "j2"];
    const result = await linkSourceImageStockToJobs(stockId, jobIds);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generation-status/link-stock",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ stockId, jobIds }),
      })
    );
    expect(result.updatedJobIds).toEqual(["j1", "j2"]);
    expect(result.updatedGeneratedImageIds).toEqual(["g1"]);
  });

  it("jobIds が上限を超える場合は COORDINATE_STOCKS_LINK_MAX_JOBS 件ごとに分割して呼ぶ", async () => {
    expect(COORDINATE_STOCKS_LINK_MAX_JOBS).toBe(4);

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updatedJobIds: ["a", "b", "c", "d"],
          updatedGeneratedImageIds: ["ga", "gb"],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updatedJobIds: ["e", "f"],
          updatedGeneratedImageIds: ["gc"],
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const jobIds = ["a", "b", "c", "d", "e", "f"];
    const result = await linkSourceImageStockToJobs(stockId, jobIds);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCallBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body
    );
    const secondCallBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as { body: string }).body
    );
    expect(firstCallBody).toEqual({
      stockId,
      jobIds: ["a", "b", "c", "d"],
    });
    expect(secondCallBody).toEqual({
      stockId,
      jobIds: ["e", "f"],
    });

    expect(result.updatedJobIds).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(result.updatedGeneratedImageIds).toEqual(["ga", "gb", "gc"]);
  });

  it("PATCH が失敗したらその時点で例外を投げる（後続 chunk は呼ばれない）", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updatedJobIds: ["a", "b", "c", "d"],
          updatedGeneratedImageIds: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "サーバーエラー" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const jobIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

    await expect(
      linkSourceImageStockToJobs(stockId, jobIds)
    ).rejects.toThrow("サーバーエラー");

    // 1 回目（成功）と 2 回目（失敗）は呼ばれる、3 回目は呼ばれない
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("レスポンスに updatedJobIds / updatedGeneratedImageIds が無くても結果は配列", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await linkSourceImageStockToJobs(stockId, ["only-job"]);

    expect(result.updatedJobIds).toEqual([]);
    expect(result.updatedGeneratedImageIds).toEqual([]);
  });
});

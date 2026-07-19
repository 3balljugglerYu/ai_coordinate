/** @jest-environment node */

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

const createAdminClientMock = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import {
  getStyleGenerateCounts,
  STYLE_POPULARITY_WINDOW_DAYS,
} from "@/features/style/lib/style-popularity";

function withRpc(result: {
  data: Array<{ style_id: string | null; generate_count: number | null }> | null;
  error: unknown;
}) {
  const rpc = jest.fn().mockResolvedValue(result);
  createAdminClientMock.mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getStyleGenerateCounts", () => {
  test("RPCの結果を Record<presetId, count> にして返す", async () => {
    const rpc = withRpc({
      data: [
        { style_id: "p1", generate_count: 52 },
        { style_id: "p2", generate_count: 3 },
        { style_id: null, generate_count: 9 }, // null id は無視
      ],
      error: null,
    });

    const counts = await getStyleGenerateCounts();

    expect(rpc).toHaveBeenCalledWith("get_style_generate_counts", {
      p_days: STYLE_POPULARITY_WINDOW_DAYS,
    });
    expect(counts).toEqual({ p1: 52, p2: 3 });
  });

  test("RPCエラー時は空(人気順なし)にフォールバック", async () => {
    withRpc({ data: null, error: { message: "boom" } });
    await expect(getStyleGenerateCounts()).resolves.toEqual({});
  });

  test("throw しても空にフォールバック(非致命)", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("down");
    });
    await expect(getStyleGenerateCounts()).resolves.toEqual({});
  });
});

/**
 * features/credits/hooks/useUsageRewardAmounts のテスト。
 *
 * クリエイター還元の告知は「運営が付与額を0にしている間は出さない」のが要件。
 * 取得前・取得失敗・不正な値のいずれでも 0 を返し、
 * 「もらえないのに告知だけ出る」ことがないことを固定する。
 */
import { renderHook, waitFor } from "@testing-library/react";
import {
  useUsageRewardAmounts,
  __resetUsageRewardAmountsCacheForTests,
} from "@/features/credits/hooks/useUsageRewardAmounts";

const originalFetch = global.fetch;

function mockFetchJson(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("useUsageRewardAmounts", () => {
  beforeEach(() => {
    __resetUsageRewardAmountsCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("取得前は0を返し、取得できたら設定値になる", async () => {
    mockFetchJson({ promptUsageRewardAmount: 2, styleUsageRewardAmount: 5 });

    const { result } = renderHook(() => useUsageRewardAmounts());

    // 初回レンダー時点では 0（告知を出さない側に倒す）
    expect(result.current.promptUsageRewardAmount).toBe(0);

    await waitFor(() => {
      expect(result.current.promptUsageRewardAmount).toBe(2);
    });
    expect(result.current.styleUsageRewardAmount).toBe(5);
  });

  test("取得に失敗しても0のままで例外を投げない", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const { result } = renderHook(() => useUsageRewardAmounts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(result.current.promptUsageRewardAmount).toBe(0);
    expect(result.current.styleUsageRewardAmount).toBe(0);
  });

  test("数値以外が返っても0として扱う", async () => {
    mockFetchJson({ promptUsageRewardAmount: "2" });

    const { result } = renderHook(() => useUsageRewardAmounts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(result.current.promptUsageRewardAmount).toBe(0);
    expect(result.current.styleUsageRewardAmount).toBe(0);
  });

  test("レスポンスがokでないときも0", async () => {
    mockFetchJson({ promptUsageRewardAmount: 9 }, false);

    const { result } = renderHook(() => useUsageRewardAmounts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(result.current.promptUsageRewardAmount).toBe(0);
  });
});

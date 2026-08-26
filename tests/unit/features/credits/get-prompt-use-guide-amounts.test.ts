/**
 * `/use-prompts` が表示する3つの額の取得テスト。
 *
 * このページは「額 0 = 停止中」を 404 の判定に使う。**取得に失敗したときに
 * 0 以外が返ると、停止中なのに「もらえます」と告知してしまう**ので、
 * fail closed(失敗は 0)であることをここで固定する。
 */

const rpcMock = jest.fn();
const getPercoinDefaultsForDisplayMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({ rpc: rpcMock })),
}));

jest.mock("@/features/credits/lib/get-percoin-defaults", () => ({
  getPercoinDefaultsForDisplay: (...args: unknown[]) =>
    getPercoinDefaultsForDisplayMock(...args),
}));

// react.cache は同一リクエスト内の重複を防ぐだけ。テストでは素通しにする
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: unknown) => fn,
}));

import { getPromptUseGuideAmounts } from "@/features/credits/lib/get-prompt-use-guide-amounts";

/** RPC 名ごとに戻り値を割り当てる。 */
function mockRpc(responses: Record<string, unknown>) {
  rpcMock.mockImplementation((name: string) => {
    const value = responses[name];
    if (value instanceof Error) {
      return Promise.reject(value);
    }
    return Promise.resolve(value ?? { data: null, error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getPromptUseGuideAmounts", () => {
  test("3つの額をそれぞれの取得元から読む", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: { data: 20, error: null },
      get_post_bonus_amounts: {
        data: { one_tap_style: 20, free: 15, coordinate: 0 },
        error: null,
      },
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 2,
    });

    await expect(getPromptUseGuideAmounts()).resolves.toEqual({
      promptUseBonusAmount: 20,
      freePostBonusAmount: 15,
      // ⭐ キーは `one_tap` ではなく `one_tap_style`(RPC の実返却で確認)
      oneTapPostBonusAmount: 20,
      creatorRewardAmount: 2,
    });
  });

  test("還元額はサブスク倍率を掛けない素の設定値で引く", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: { data: 20, error: null },
      get_post_bonus_amounts: { data: { free: 20 }, error: null },
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 2,
    });

    await getPromptUseGuideAmounts();

    expect(getPercoinDefaultsForDisplayMock).toHaveBeenCalledWith("free");
  });

  test("付与額の RPC がエラーなら 0（停止中扱い）に倒す", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: {
        data: null,
        error: { code: "PGRST202", message: "not found" },
      },
      get_post_bonus_amounts: { data: { free: 20 }, error: null },
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 2,
    });

    const result = await getPromptUseGuideAmounts();

    expect(result.promptUseBonusAmount).toBe(0);
    // 他の値まで道連れにしない
    expect(result.freePostBonusAmount).toBe(20);
  });

  test("RPC が例外を投げても全体は落ちず 0 になる", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: new Error("network"),
      get_post_bonus_amounts: new Error("network"),
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 2,
    });

    await expect(getPromptUseGuideAmounts()).resolves.toEqual({
      promptUseBonusAmount: 0,
      freePostBonusAmount: 0,
      oneTapPostBonusAmount: 0,
      creatorRewardAmount: 2,
    });
  });

  test("還元額の取得が失敗しても、付与額の表示は生き残る", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: { data: 20, error: null },
      get_post_bonus_amounts: { data: { free: 20 }, error: null },
    });
    getPercoinDefaultsForDisplayMock.mockRejectedValue(new Error("admin key"));

    await expect(getPromptUseGuideAmounts()).resolves.toEqual({
      promptUseBonusAmount: 20,
      freePostBonusAmount: 20,
      oneTapPostBonusAmount: 0,
      creatorRewardAmount: 0,
    });
  });

  test("数値でない値・負値・0 はすべて 0 として扱う", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: { data: "20", error: null },
      get_post_bonus_amounts: { data: { free: -5 }, error: null },
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 0,
    });

    await expect(getPromptUseGuideAmounts()).resolves.toEqual({
      promptUseBonusAmount: 0,
      freePostBonusAmount: 0,
      oneTapPostBonusAmount: 0,
      creatorRewardAmount: 0,
    });
  });

  test("free の行が無い環境（migration 未適用）でも 0 で落ち着く", async () => {
    mockRpc({
      get_prompt_use_bonus_amount: { data: 20, error: null },
      get_post_bonus_amounts: { data: {}, error: null },
    });
    getPercoinDefaultsForDisplayMock.mockResolvedValue({
      promptUsageRewardAmount: 2,
    });

    const result = await getPromptUseGuideAmounts();

    expect(result.freePostBonusAmount).toBe(0);
  });
});

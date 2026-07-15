/** @jest-environment node */

const createAdminClientMock = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import { getGeneratedCollectionPresetIds } from "@/features/collections/lib/generated-preset-ids";

/** image_jobs クエリのチェーンをモックし、最終 .limit() が {data,error} を返すようにする。 */
function mockImageJobs(result: {
  data: Array<{ style_template_id: string | null }> | null;
  error: unknown;
}) {
  const limit = jest.fn().mockResolvedValue(result);
  const not = jest.fn(() => ({ limit }));
  const inFn = jest.fn(() => ({ not }));
  const eq2 = jest.fn(() => ({ in: inFn }));
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const select = jest.fn(() => ({ eq: eq1 }));
  const from = jest.fn(() => ({ select }));
  createAdminClientMock.mockReturnValue({ from });
  return { from, select, inFn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getGeneratedCollectionPresetIds", () => {
  test("カテゴリが空なら DB を叩かず空配列", async () => {
    const result = await getGeneratedCollectionPresetIds("user-1", []);
    expect(result).toEqual([]);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  test("成功ジョブの style_template_id を重複排除して返す", async () => {
    const { inFn } = mockImageJobs({
      data: [
        { style_template_id: "p1" },
        { style_template_id: "p2" },
        { style_template_id: "p1" }, // 重複
        { style_template_id: null }, // null は無視
      ],
      error: null,
    });

    const result = await getGeneratedCollectionPresetIds("user-1", [
      "kotowaza_dictionary",
    ]);

    expect(inFn).toHaveBeenCalledWith("style_preset_category_key", [
      "kotowaza_dictionary",
    ]);
    expect(result.sort()).toEqual(["p1", "p2"]);
  });

  test("RPCエラー時は空配列にフォールバックする", async () => {
    mockImageJobs({ data: null, error: { message: "boom" } });
    const result = await getGeneratedCollectionPresetIds("user-1", ["k"]);
    expect(result).toEqual([]);
  });
});

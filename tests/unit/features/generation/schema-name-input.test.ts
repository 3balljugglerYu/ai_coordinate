import { generationRequestSchema } from "@/features/generation/lib/schema";

const base = { sourceImageStockId: "11111111-1111-4111-8111-111111111111" };

describe("generationRequestSchema: nameInput", () => {
  test("じゆうモードの8文字までの名前は受け付ける", () => {
    expect(
      generationRequestSchema.safeParse({ ...base, prompt: "猫", generationType: "free", nameInput: "ぺるこ" }).success,
    ).toBe(true);
  });

  test("じゆうモード以外では受け付けない", () => {
    const result = generationRequestSchema.safeParse({ ...base, prompt: "猫", generationType: "coordinate", nameInput: "ぺるこ" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["nameInput"]);
  });

  test("派生生成(本文なし)でも名前は送れる", () => {
    expect(
      generationRequestSchema.safeParse({
        ...base,
        sourcePostId: "22222222-2222-4222-8222-222222222222",
        generationType: "free",
        nameInput: "ぺるこ",
      }).success,
    ).toBe(true);
  });
});

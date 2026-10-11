/** @jest-environment node */

import { generateImageAsync } from "@/features/generation/lib/async-api";
import {
  GenerationSubmitError,
  isTextInputFlaggedError,
} from "@/features/generation/lib/generation-submit-error";
import type { GenerationRequest } from "@/features/generation/types";

const base: GenerationRequest = {
  prompt: "猫",
  sourceImageStockId: "11111111-1111-1111-1111-111111111111",
  model: "gpt-image-2-low-1k",
  generationType: "free",
};

function mockRejectedSubmit(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("generateImageAsync: 受付が断ったときのエラー(2026-10-12)", () => {
  test("サーバーの errorCode とメッセージを持たせる(文字入力の判定で断られたと分かる)", async () => {
    mockRejectedSubmit({ error: "一部、ご利用いただけない表現があるようです。", errorCode: "GENERATION_TEXT_INPUT_FLAGGED" });
    const error = await generateImageAsync(base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationSubmitError);
    expect((error as GenerationSubmitError).message).toBe("一部、ご利用いただけない表現があるようです。");
    expect(isTextInputFlaggedError(error)).toBe(true);
  });

  test("ほかの理由で断られたときは、文字入力の判定とは見なさない", async () => {
    mockRejectedSubmit({ error: "不正なリクエストです", errorCode: "GENERATION_INVALID_REQUEST" });
    const error = await generateImageAsync(base).catch((e: unknown) => e);
    expect(isTextInputFlaggedError(error)).toBe(false);
    expect(isTextInputFlaggedError(new Error("x"))).toBe(false);
  });
});

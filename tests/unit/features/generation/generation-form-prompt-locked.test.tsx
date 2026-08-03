/** @jest-environment node */

/**
 * 施錠モード (promptLocked) の判定を固定する。
 *
 * GenerationForm 全体は画像ピッカー・モデル選択・localStorage・AuthModal を
 * 抱えており DOM テストが重い。判定だけを prompt-locked-submission.ts へ
 * 切り出してあるので、**実際に使われている関数**をそのままテストする。
 * 式を写して検証すると、実装だけ変わってテストが通り続ける。
 *
 * 守りたいのは
 * - 施錠時は本文を送らない（送ると schema が 400 にする / ADR-006）
 * - 施錠時でも画像があれば生成ボタンが押せる（本文必須のままだと永久に押せない）
 */

import {
  buildPromptRequestFields,
  isGenerationSubmitDisabled,
  resolveSubmittedPrompt,
} from "@/features/generation/lib/prompt-locked-submission";

const BASE = {
  promptLocked: false,
  prompt: "",
  isPromptTooLong: false,
  hasSourceImage: true,
  isGenerating: false,
  guestGenerationLocked: false,
};

describe("通常モードの生成ボタン", () => {
  it("本文が空なら押せない", () => {
    expect(isGenerationSubmitDisabled({ ...BASE, prompt: "" })).toBe(true);
  });

  it("本文があれば押せる", () => {
    expect(isGenerationSubmitDisabled({ ...BASE, prompt: "夏服にして" })).toBe(false);
  });

  it("本文が上限超過なら押せない", () => {
    expect(
      isGenerationSubmitDisabled({ ...BASE, prompt: "あ", isPromptTooLong: true })
    ).toBe(true);
  });
});

describe("施錠モードの生成ボタン", () => {
  it("本文が空でも画像があれば押せる", () => {
    // 本文必須のままにすると、施錠モードでは永久に押せない
    expect(isGenerationSubmitDisabled({ ...BASE, promptLocked: true, prompt: "" })).toBe(
      false
    );
  });

  it("本文の上限判定は効かない", () => {
    // 施錠時は入力させないので、長さは判定に入らない
    expect(
      isGenerationSubmitDisabled({
        ...BASE,
        promptLocked: true,
        prompt: "",
        isPromptTooLong: true,
      })
    ).toBe(false);
  });

  it("画像が無ければ押せない", () => {
    // 派生生成でも元画像は必須（ユーザー確認済み: じゆうモードは生成元が必ずある）
    expect(
      isGenerationSubmitDisabled({
        ...BASE,
        promptLocked: true,
        hasSourceImage: false,
      })
    ).toBe(true);
  });

  it("生成中は押せない", () => {
    expect(
      isGenerationSubmitDisabled({ ...BASE, promptLocked: true, isGenerating: true })
    ).toBe(true);
  });
});

describe("送信する本文", () => {
  it("通常モードは trim した本文を送る", () => {
    expect(resolveSubmittedPrompt(false, "  夏服にして  ")).toBe("夏服にして");
  });

  it("施錠モードは常に空文字", () => {
    // state に値が残っていても送らない。API は sourcePostId だけを受け取り、
    // 本文はサーバーが author secret から解決する（REQ-005）。
    expect(resolveSubmittedPrompt(true, "差し替えた本文")).toBe("");
  });
});

describe("リクエスト body の排他", () => {
  it("原作 ID があるときは本文を載せない", () => {
    const body = buildPromptRequestFields({
      prompt: "差し替えた本文",
      sourcePostId: "22222222-2222-4222-8222-222222222222",
    });

    expect(body).toEqual({
      sourcePostId: "22222222-2222-4222-8222-222222222222",
    });
    expect("prompt" in body).toBe(false);
  });

  it("原作 ID が無いときは本文を載せる", () => {
    const body = buildPromptRequestFields({ prompt: "夏服にして" });

    expect(body).toEqual({ prompt: "夏服にして" });
    expect("sourcePostId" in body).toBe(false);
  });
});

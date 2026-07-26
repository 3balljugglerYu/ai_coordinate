import { buildPrompt } from "@/shared/generation/prompt-core";
import { PROMPT_REGISTRY } from "@/shared/generation/prompt-registry";
import { FREE_GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";

// じゆうモードの既定モデル OpenAI gpt-image-2 のプロンプト上限。
const OPENAI_GPT_IMAGE_PROMPT_LIMIT = 32000;

describe("じゆうモードのプロンプト長設計", () => {
  test("入力上限は30,000文字", () => {
    expect(FREE_GENERATION_PROMPT_MAX_LENGTH).toBe(30000);
  });

  test("free.base_prefix は1,800文字未満(錨+入力30,000がOpenAI上限32,000内に収まる)", () => {
    const anchor = PROMPT_REGISTRY["free.base_prefix"].defaultContent;
    expect(anchor.length).toBeLessThan(1800);
  });

  test("錨+入力上限30,000の最終プロンプトがOpenAI上限32,000文字を超えない", () => {
    // 上限ちょうど(30,000字)のユーザー入力で最終プロンプト長を実測する。
    const maxUserInput = "あ".repeat(FREE_GENERATION_PROMPT_MAX_LENGTH);
    const finalPrompt = buildPrompt({
      generationType: "free",
      outfitDescription: maxUserInput,
      backgroundMode: "keep",
    });
    expect(finalPrompt.length).toBeLessThanOrEqual(
      OPENAI_GPT_IMAGE_PROMPT_LIMIT,
    );
  });
});

/** @jest-environment node */

import {
  buildStyleAttemptReinforcementPrefix,
  buildStyleGenerationPrompt,
  STYLE_PROMPT_BASE_PREFIX,
  STYLE_PROMPT_ILLUSTRATION_SUFFIX,
  STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
  STYLE_PROMPT_REAL_SUFFIX,
} from "@/shared/generation/style-prompts";
import { PROMPT_REGISTRY } from "@/shared/generation/prompt-registry";

const STYLE_BASE_PREFIX_FREE_POSE =
  PROMPT_REGISTRY["style.base_prefix_free_pose"].defaultContent;
const STYLE_KEEP_BG_FREE_POSE =
  PROMPT_REGISTRY["style.keep_background_suffix_free_pose"].defaultContent;
const STYLE_CHANGE_BG_FREE_POSE =
  PROMPT_REGISTRY["style.change_background_suffix_free_pose"].defaultContent;

describe("buildStyleGenerationPrompt - default (skipBasePrefix = false)", () => {
  test("illustration + backgroundChange=false で base_prefix + illustration_suffix + keep_background_suffix を含む", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "Wearing pajamas",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
    });
    expect(result).toContain(STYLE_PROMPT_BASE_PREFIX);
    expect(result).toContain(STYLE_PROMPT_ILLUSTRATION_SUFFIX);
    expect(result).toContain(STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX);
    expect(result).toContain("Styling Direction:\nWearing pajamas");
    expect(result).not.toContain("Background Direction:");
  });

  test("real ソースの時 illustration_suffix ではなく real_suffix を選ぶ", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "Wearing pajamas",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "real",
    });
    expect(result).toContain(STYLE_PROMPT_REAL_SUFFIX);
    expect(result).not.toContain(STYLE_PROMPT_ILLUSTRATION_SUFFIX);
  });

  test("backgroundChange=true + backgroundPrompt あり で Background Direction を末尾に追記する", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "Wearing pajamas",
      backgroundPrompt: "Soft spring background",
      backgroundChange: true,
      sourceImageType: "illustration",
    });
    expect(result).toContain("Background Direction:\nSoft spring background");
  });

  test("templates dict 指定で base_prefix を override できる", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      templates: {
        "style.base_prefix": "CUSTOM PREFIX",
      },
    });
    expect(result).toContain("CUSTOM PREFIX");
    expect(result).not.toContain(STYLE_PROMPT_BASE_PREFIX);
  });
});

describe("buildStyleGenerationPrompt - skipBasePrefix = true (raw モード)", () => {
  test("base_prefix / illustration_suffix / keep_background_suffix を一切含まず styling prompt だけになる", () => {
    const result = buildStyleGenerationPrompt(
      {
        stylingPrompt: "Convert to chibi style",
        backgroundPrompt: null,
        backgroundChange: false,
        sourceImageType: "illustration",
      },
      { skipBasePrefix: true },
    );
    expect(result).toBe("Styling Direction:\nConvert to chibi style");
    expect(result).not.toContain(STYLE_PROMPT_BASE_PREFIX);
    expect(result).not.toContain(STYLE_PROMPT_ILLUSTRATION_SUFFIX);
    expect(result).not.toContain(STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX);
  });

  test("raw モードでも backgroundChange=true + backgroundPrompt あり なら Background Direction を追記する", () => {
    const result = buildStyleGenerationPrompt(
      {
        stylingPrompt: "Convert to chibi style",
        backgroundPrompt: "Cute pastel background",
        backgroundChange: true,
        sourceImageType: "illustration",
      },
      { skipBasePrefix: true },
    );
    expect(result).toBe(
      "Styling Direction:\nConvert to chibi style\n\nBackground Direction:\nCute pastel background",
    );
  });

  test("raw モードでは sourceImageType は影響しない (real でも illustration でも結果同じ)", () => {
    const baseParams = {
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
    };
    const illustration = buildStyleGenerationPrompt(
      { ...baseParams, sourceImageType: "illustration" as const },
      { skipBasePrefix: true },
    );
    const real = buildStyleGenerationPrompt(
      { ...baseParams, sourceImageType: "real" as const },
      { skipBasePrefix: true },
    );
    expect(illustration).toBe(real);
  });
});

describe("buildStyleGenerationPrompt - framingMode", () => {
  const baseParams = {
    stylingPrompt: "Wearing pajamas",
    backgroundPrompt: null,
    backgroundChange: false,
    sourceImageType: "illustration" as const,
  };

  test("free_pose で base_prefix_free_pose を使い、locked 用 prefix と style suffix を含まない", () => {
    const result = buildStyleGenerationPrompt(baseParams, {
      framingMode: "free_pose",
    });
    expect(result).toContain(STYLE_BASE_PREFIX_FREE_POSE);
    expect(result).not.toContain(STYLE_PROMPT_BASE_PREFIX);
    expect(result).not.toContain(STYLE_PROMPT_ILLUSTRATION_SUFFIX);
    expect(result).toContain("Styling Direction:\nWearing pajamas");
  });

  test("free_pose + real ソースでも real_suffix を含まない (画風維持は free_pose 前文に内包)", () => {
    const result = buildStyleGenerationPrompt(
      { ...baseParams, sourceImageType: "real" as const },
      { framingMode: "free_pose" },
    );
    expect(result).not.toContain(STYLE_PROMPT_REAL_SUFFIX);
    expect(result).toContain(STYLE_BASE_PREFIX_FREE_POSE);
  });

  test("free_pose + backgroundChange=false で keep_background_suffix_free_pose を使う", () => {
    const result = buildStyleGenerationPrompt(baseParams, {
      framingMode: "free_pose",
    });
    expect(result).toContain(STYLE_KEEP_BG_FREE_POSE);
    expect(result).not.toContain(STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX);
  });

  test("free_pose + backgroundChange=true で change_background_suffix_free_pose と Background Direction を使う", () => {
    const result = buildStyleGenerationPrompt(
      {
        ...baseParams,
        backgroundChange: true,
        backgroundPrompt: "Soft spring background",
      },
      { framingMode: "free_pose" },
    );
    expect(result).toContain(STYLE_CHANGE_BG_FREE_POSE);
    expect(result).toContain("Background Direction:\nSoft spring background");
  });

  test("framingMode 省略 / locked は現行挙動と完全一致 (後方互換)", () => {
    const omitted = buildStyleGenerationPrompt(baseParams);
    const locked = buildStyleGenerationPrompt(baseParams, {
      framingMode: "locked",
    });
    expect(locked).toBe(omitted);
    expect(omitted).toContain(STYLE_PROMPT_BASE_PREFIX);
  });

  test("skipBasePrefix=true は framingMode より優先される (raw 勝ち)", () => {
    const result = buildStyleGenerationPrompt(baseParams, {
      skipBasePrefix: true,
      framingMode: "free_pose",
    });
    expect(result).toBe("Styling Direction:\nWearing pajamas");
    expect(result).not.toContain(STYLE_BASE_PREFIX_FREE_POSE);
  });

  test("templates dict で base_prefix_free_pose を override できる", () => {
    const result = buildStyleGenerationPrompt(
      {
        ...baseParams,
        templates: { "style.base_prefix_free_pose": "CUSTOM FREE POSE PREFIX" },
      },
      { framingMode: "free_pose" },
    );
    expect(result).toContain("CUSTOM FREE POSE PREFIX");
    expect(result).not.toContain(STYLE_BASE_PREFIX_FREE_POSE);
  });

  test("free_pose + userPromptInput で User Visual Preferences も結合される", () => {
    const result = buildStyleGenerationPrompt(
      { ...baseParams, userPromptInput: "Sitting on a bench, low angle" },
      { framingMode: "free_pose" },
    );
    expect(result).toContain(
      "User Visual Preferences:\nSitting on a bench, low angle",
    );
  });
});

describe("buildStyleAttemptReinforcementPrefix - framingMode", () => {
  test("attempt1 は framingMode に関わらず空文字", () => {
    expect(buildStyleAttemptReinforcementPrefix(1)).toBe("");
    expect(buildStyleAttemptReinforcementPrefix(1, undefined, "free_pose")).toBe(
      "",
    );
  });

  test("locked / 省略時はフレーム固定を再強制する既存文言を使う", () => {
    const prefix = buildStyleAttemptReinforcementPrefix(2);
    expect(prefix).toContain("RETRY NOTICE (attempt 2)");
    expect(prefix).toContain("Do not extend the crop");
  });

  test("free_pose ではフレーム固定を再強制しない変種を使う", () => {
    const prefix = buildStyleAttemptReinforcementPrefix(2, undefined, "free_pose");
    expect(prefix).toContain("RETRY NOTICE (attempt 2)");
    expect(prefix).not.toContain("Do not extend the crop");
    expect(prefix).toContain("allowed to change");
    expect(prefix.endsWith("\n\n")).toBe(true);
  });
});

describe("buildStyleGenerationPrompt - userPromptInput 結合", () => {
  test("通常モード + userPromptInput あり: User Visual Preferences セクションを末尾に追加し guard 文を挿入する", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "Wearing pajamas",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      userPromptInput: "Add long sleeves",
    });
    expect(result).toContain("Styling Direction:\nWearing pajamas");
    expect(result).toContain("User Visual Preferences:\nAdd long sleeves");
    expect(result).toContain(
      "Treat the following as the user's supplemental visual preferences",
    );
  });

  test("通常モード + userPromptInput 空文字: User Visual Preferences セクションは付かない", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      userPromptInput: "",
    });
    expect(result).not.toContain("User Visual Preferences");
  });

  test("通常モード + userPromptInput 空白のみ: trim 後に空なら付かない", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      userPromptInput: "   \n  \t  ",
    });
    expect(result).not.toContain("User Visual Preferences");
  });

  test("通常モード + userPromptInput null: 付かない", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      userPromptInput: null,
    });
    expect(result).not.toContain("User Visual Preferences");
  });

  test("raw モード + userPromptInput: skip_base_prefix でも User Visual Preferences を結合する", () => {
    const result = buildStyleGenerationPrompt(
      {
        stylingPrompt: "Convert to chibi",
        backgroundPrompt: null,
        backgroundChange: false,
        sourceImageType: "illustration",
        userPromptInput: "Use pastel colors",
      },
      { skipBasePrefix: true },
    );
    expect(result).toContain("Styling Direction:\nConvert to chibi");
    expect(result).toContain("User Visual Preferences:\nUse pastel colors");
    expect(result).toContain(
      "Treat the following as the user's supplemental visual preferences",
    );
  });

  test("通常モード + backgroundChange + userPromptInput: Background Direction の後に User Visual Preferences が来る", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: "Spring city",
      backgroundChange: true,
      sourceImageType: "illustration",
      userPromptInput: "Extra request",
    });
    const bgIndex = result.indexOf("Background Direction");
    const userIndex = result.indexOf("User Visual Preferences");
    expect(bgIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(bgIndex);
  });

  test("userPromptInput は前後の空白を trim して挿入する", () => {
    const result = buildStyleGenerationPrompt({
      stylingPrompt: "P",
      backgroundPrompt: null,
      backgroundChange: false,
      sourceImageType: "illustration",
      userPromptInput: "  hello  \n",
    });
    expect(result).toContain("User Visual Preferences:\nhello");
    expect(result).not.toContain("hello  \n");
  });
});


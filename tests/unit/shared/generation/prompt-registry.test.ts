/** @jest-environment node */

import {
  PROMPT_REGISTRY,
  PROMPT_KEYS,
  PROMPT_CATEGORIES,
  getDefaultPromptContent,
  isKnownPromptKey,
  type PromptDefinition,
} from "@/shared/generation/prompt-registry";
import { extractTemplateVariables } from "@/shared/generation/prompt-template";

describe("PROMPT_REGISTRY", () => {
  test("PROMPT_KEYS は registry の key と一致する", () => {
    const keys = Object.keys(PROMPT_REGISTRY);
    expect(PROMPT_KEYS).toEqual(keys);
    expect(PROMPT_KEYS.length).toBeGreaterThan(0);
  });

  test("各 key の category は PROMPT_CATEGORIES のいずれかである", () => {
    for (const key of PROMPT_KEYS) {
      const def = PROMPT_REGISTRY[key];
      expect(PROMPT_CATEGORIES).toContain(def.category);
    }
  });

  test("各 key の defaultContent は非空文字列である", () => {
    for (const key of PROMPT_KEYS) {
      const def = PROMPT_REGISTRY[key];
      expect(typeof def.defaultContent).toBe("string");
      expect(def.defaultContent.trim().length).toBeGreaterThan(0);
    }
  });

  test("各 key の defaultContent 内の {{varname}} は supportedVariables と一致する", () => {
    for (const key of PROMPT_KEYS) {
      const def = PROMPT_REGISTRY[key];
      const found = extractTemplateVariables(def.defaultContent);
      expect(new Set(found)).toEqual(new Set(def.supportedVariables));
    }
  });

  test("supportedVariables があれば previewSamples で全変数を埋められる", () => {
    for (const key of PROMPT_KEYS) {
      // as const satisfies の literal 型を緩めて optional field を読む
      const def = PROMPT_REGISTRY[key] as PromptDefinition;
      if (def.supportedVariables.length === 0) continue;
      // preview する場合に、各 variable に対する sample 値が定義されていること
      expect(def.previewSamples).toBeDefined();
      for (const v of def.supportedVariables) {
        expect(def.previewSamples?.[v]).toBeDefined();
      }
    }
  });

  test("全カテゴリすべてに少なくとも 1 つの key が存在する", () => {
    for (const category of PROMPT_CATEGORIES) {
      const found = PROMPT_KEYS.some(
        (k) => PROMPT_REGISTRY[k].category === category,
      );
      expect(found).toBe(true);
    }
  });

  test("creator_looks カテゴリには meta_extractor が存在する", () => {
    expect(PROMPT_KEYS).toContain("creator_looks.meta_extractor");
    const def = PROMPT_REGISTRY["creator_looks.meta_extractor"];
    expect(def.category).toBe("creator_looks");
    // meta-prompt 本体に必須のセクションヘッダが含まれる
    expect(def.defaultContent).toContain("Styling Direction");
    expect(def.defaultContent).toContain("Background");
    expect(def.defaultContent).toContain("Constraints");
    // 変数は含まれない (= 画像入力のみ)
    expect(def.supportedVariables).toEqual([]);
  });
});

describe("getDefaultPromptContent", () => {
  test("既知 key は default content を返す", () => {
    expect(getDefaultPromptContent("style.base_prefix")).toContain(
      "CRITICAL INSTRUCTION",
    );
  });

  test("未知 key は undefined", () => {
    expect(getDefaultPromptContent("non.existent")).toBeUndefined();
  });
});

describe("isKnownPromptKey", () => {
  test("registry の key は true", () => {
    expect(isKnownPromptKey("inspire.preamble")).toBe(true);
  });

  test("未知 key は false", () => {
    expect(isKnownPromptKey("inspire.unknown")).toBe(false);
  });
});

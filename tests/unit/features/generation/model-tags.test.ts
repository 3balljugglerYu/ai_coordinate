import {
  GPT_IMAGE_2_CANONICAL_MODELS,
} from "@/shared/generation/openai-image-model";
import {
  MODEL_TAG_DISPLAY,
  getModelTagsForCanonicalModel,
  type ModelTagKey,
} from "@/features/generation/lib/model-tags";

describe("getModelTagsForCanonicalModel", () => {
  it("ChatGPT Images 2.0 は quality でポジションが決まる（size tier 非依存）", () => {
    expect(getModelTagsForCanonicalModel("gpt-image-2-low-1k")).toEqual([
      "tierLight",
    ]);
    expect(getModelTagsForCanonicalModel("gpt-image-2-low-4k")).toEqual([
      "tierLight",
    ]);
    expect(getModelTagsForCanonicalModel("gpt-image-2-medium-2k")).toEqual([
      "tierBalanced",
    ]);
    expect(getModelTagsForCanonicalModel("gpt-image-2-high-1k")).toEqual([
      "tierQuality",
    ]);
  });

  it("Nano Banana Pro は高精細、flash 系は解像度で軽量 / 標準", () => {
    expect(getModelTagsForCanonicalModel("gemini-3-pro-image-1k")).toEqual([
      "tierQuality",
    ]);
    expect(getModelTagsForCanonicalModel("gemini-3-pro-image-4k")).toEqual([
      "tierQuality",
    ]);
    expect(
      getModelTagsForCanonicalModel("gemini-3.1-flash-image-preview-512"),
    ).toEqual(["tierLight"]);
    expect(
      getModelTagsForCanonicalModel("gemini-3.1-flash-image-preview-1024"),
    ).toEqual(["tierBalanced"]);
    expect(getModelTagsForCanonicalModel("gemini-2.5-flash-image")).toEqual([
      "tierLight",
    ]);
  });

  it("未知 ID / null / 空文字では空配列", () => {
    expect(getModelTagsForCanonicalModel(null)).toEqual([]);
    expect(getModelTagsForCanonicalModel(undefined)).toEqual([]);
    expect(getModelTagsForCanonicalModel("")).toEqual([]);
    expect(getModelTagsForCanonicalModel("some-future-model")).toEqual([]);
  });

  it("gpt-image-2 の全正規モデルが tier チップ 1 個を返す", () => {
    for (const model of GPT_IMAGE_2_CANONICAL_MODELS) {
      const tags = getModelTagsForCanonicalModel(model);
      expect(tags).toHaveLength(1);
      expect(tags[0]).toMatch(/^tier(Light|Balanced|Quality)$/);
    }
  });

  it("返すタグはすべて MODEL_TAG_DISPLAY に表示定義がある", () => {
    const samples = [
      "gpt-image-2-low-1k",
      "gpt-image-2-medium-1k",
      "gpt-image-2-high-1k",
      "gemini-3-pro-image-2k",
      "gemini-3.1-flash-image-preview-512",
      "gemini-3.1-flash-image-preview-1024",
    ];
    for (const model of samples) {
      for (const tag of getModelTagsForCanonicalModel(model)) {
        expect(MODEL_TAG_DISPLAY[tag as ModelTagKey]).toBeDefined();
      }
    }
  });
});

describe("getModelTagsForCanonicalModel（ChatGPT Images 2.5）", () => {
  it("2.5 の quality から tier チップを返す", () => {
    expect(getModelTagsForCanonicalModel("gpt-image-2.5-flare-low-1k")).toEqual([
      "tierLight",
    ]);
    expect(
      getModelTagsForCanonicalModel("gpt-image-2.5-flare-medium-2k"),
    ).toEqual(["tierBalanced"]);
    expect(getModelTagsForCanonicalModel("gpt-image-2.5-flare-high-4k")).toEqual(
      ["tierQuality"],
    );
  });

  it("2.0 の tier チップは変わらない（回帰ガード）", () => {
    expect(getModelTagsForCanonicalModel("gpt-image-2-low-1k")).toEqual([
      "tierLight",
    ]);
    expect(getModelTagsForCanonicalModel("gpt-image-2-medium-2k")).toEqual([
      "tierBalanced",
    ]);
    expect(getModelTagsForCanonicalModel("gpt-image-2-high-4k")).toEqual([
      "tierQuality",
    ]);
  });
});

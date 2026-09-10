import {
  DEFAULT_GPT_IMAGE_2_MODEL,
  GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS,
  GPT_IMAGE_2_CANONICAL_MODELS,
  GPT_IMAGE_2_LEGACY_LOW_MODEL,
  GPT_IMAGE_2_QUALITIES,
  GPT_IMAGE_2_SIZE_TIERS,
  OPENAI_IMAGE_CANONICAL_MODELS,
  OPENAI_IMAGE_FAMILIES,
  OPENAI_IMAGE_PERCOIN_COSTS,
  composeOpenAIImageModel,
  isGptImage25FlareModel,
  isOpenAIImageCanonicalModel,
  parseOpenAIImageModel,
  toOpenAIApiModelName,
} from "@/shared/generation/openai-image-model";

/**
 * ⭐ 回帰ガード(REQ-013): family 化の前から存在する gpt-image-2 の canonical と
 * ペルコインを**リテラルで**固定する。定数を参照して比較すると、定数側を壊しても
 * テストが一緒に壊れて気づけないため、ここだけは手書きの値を置く。
 */
const GPT_IMAGE_2_BASELINE = {
  "gpt-image-2-low-1k": 10,
  "gpt-image-2-low-2k": 20,
  "gpt-image-2-low-4k": 40,
  "gpt-image-2-medium-1k": 20,
  "gpt-image-2-medium-2k": 50,
  "gpt-image-2-medium-4k": 80,
  "gpt-image-2-high-1k": 50,
  "gpt-image-2-high-2k": 80,
  "gpt-image-2-high-4k": 130,
} as const;

describe("OPENAI_IMAGE_FAMILIES / canonical 一覧", () => {
  it("family は gpt-image-2 と gpt-image-2.5-flare の 2 つ(sunburst は導入しない)", () => {
    expect(OPENAI_IMAGE_FAMILIES).toEqual(["gpt-image-2", "gpt-image-2.5-flare"]);
  });

  it("canonical は family × quality × size tier の 18 件で重複がない", () => {
    expect(OPENAI_IMAGE_CANONICAL_MODELS).toHaveLength(
      OPENAI_IMAGE_FAMILIES.length *
        GPT_IMAGE_2_QUALITIES.length *
        GPT_IMAGE_2_SIZE_TIERS.length
    );
    expect(new Set(OPENAI_IMAGE_CANONICAL_MODELS).size).toBe(18);
    expect(OPENAI_IMAGE_CANONICAL_MODELS).toEqual([
      ...GPT_IMAGE_2_CANONICAL_MODELS,
      ...GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS,
    ]);
  });

  it("回帰ガード: gpt-image-2 の canonical 9 件は family 化の前後で同じ", () => {
    expect([...GPT_IMAGE_2_CANONICAL_MODELS].sort()).toEqual(
      Object.keys(GPT_IMAGE_2_BASELINE).sort()
    );
    expect(DEFAULT_GPT_IMAGE_2_MODEL).toBe("gpt-image-2-low-1k");
    expect(GPT_IMAGE_2_LEGACY_LOW_MODEL).toBe("gpt-image-2-low");
  });

  it("gpt-image-2.5-flare の canonical 9 件は 2.0 と同じ命名規則", () => {
    expect([...GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS].sort()).toEqual(
      [
        "gpt-image-2.5-flare-low-1k",
        "gpt-image-2.5-flare-low-2k",
        "gpt-image-2.5-flare-low-4k",
        "gpt-image-2.5-flare-medium-1k",
        "gpt-image-2.5-flare-medium-2k",
        "gpt-image-2.5-flare-medium-4k",
        "gpt-image-2.5-flare-high-1k",
        "gpt-image-2.5-flare-high-2k",
        "gpt-image-2.5-flare-high-4k",
      ].sort()
    );
  });
});

describe("composeOpenAIImageModel / parseOpenAIImageModel", () => {
  it("全 family × quality × size tier で compose → parse が往復する", () => {
    for (const family of OPENAI_IMAGE_FAMILIES) {
      for (const quality of GPT_IMAGE_2_QUALITIES) {
        for (const sizeTier of GPT_IMAGE_2_SIZE_TIERS) {
          const canonical = composeOpenAIImageModel(family, quality, sizeTier);
          expect(canonical).toBe(`${family}-${quality}-${sizeTier}`);
          expect(parseOpenAIImageModel(canonical)).toEqual({
            canonical,
            family,
            quality,
            sizeTier,
          });
        }
      }
    }
  });

  it("2.5 の canonical は文字列の位置解析に頼らず family / quality / sizeTier を復元する", () => {
    // "gpt-image-2.5-flare-medium-2k".split("-") は 3 番目が "2.5"、4 番目が "flare"
    // になるため、位置で quality を取り出す実装だと壊れる(ADR-002)。
    expect(parseOpenAIImageModel("gpt-image-2.5-flare-medium-2k")).toEqual({
      canonical: "gpt-image-2.5-flare-medium-2k",
      family: "gpt-image-2.5-flare",
      quality: "medium",
      sizeTier: "2k",
    });
  });

  it("legacy `gpt-image-2-low` は gpt-image-2-low-1k として復元する", () => {
    expect(parseOpenAIImageModel(GPT_IMAGE_2_LEGACY_LOW_MODEL)).toEqual({
      canonical: "gpt-image-2-low-1k",
      family: "gpt-image-2",
      quality: "low",
      sizeTier: "1k",
    });
  });

  it("2.5 には legacy alias が無い(`gpt-image-2.5-flare-low` は null)", () => {
    expect(parseOpenAIImageModel("gpt-image-2.5-flare-low")).toBeNull();
  });

  it("OpenAI 系以外・未知の値・null / undefined は null", () => {
    expect(parseOpenAIImageModel("gemini-3-pro-image-1k")).toBeNull();
    expect(parseOpenAIImageModel("gpt-image-bogus")).toBeNull();
    expect(parseOpenAIImageModel("gpt-image-2.5-sunburst-low-1k")).toBeNull();
    expect(parseOpenAIImageModel("gpt-image-2-xhigh-1k")).toBeNull();
    expect(parseOpenAIImageModel("gpt-image-2-low-8k")).toBeNull();
    expect(parseOpenAIImageModel("")).toBeNull();
    expect(parseOpenAIImageModel(null)).toBeNull();
    expect(parseOpenAIImageModel(undefined)).toBeNull();
  });

  it("isOpenAIImageCanonicalModel は canonical だけ true(legacy alias は false)", () => {
    for (const model of OPENAI_IMAGE_CANONICAL_MODELS) {
      expect(isOpenAIImageCanonicalModel(model)).toBe(true);
    }
    expect(isOpenAIImageCanonicalModel(GPT_IMAGE_2_LEGACY_LOW_MODEL)).toBe(false);
    expect(isOpenAIImageCanonicalModel("gemini-3-pro-image-1k")).toBe(false);
    expect(isOpenAIImageCanonicalModel(null)).toBe(false);
    expect(isOpenAIImageCanonicalModel(42)).toBe(false);
  });
});

describe("OPENAI_IMAGE_PERCOIN_COSTS", () => {
  it("全 canonical 18 件に消費量が定義されている", () => {
    expect(Object.keys(OPENAI_IMAGE_PERCOIN_COSTS).sort()).toEqual(
      [...OPENAI_IMAGE_CANONICAL_MODELS].sort()
    );
  });

  it("回帰ガード: gpt-image-2 のペルコインは family 化の前後で 1 つも変わらない", () => {
    for (const [model, cost] of Object.entries(GPT_IMAGE_2_BASELINE)) {
      expect([model, OPENAI_IMAGE_PERCOIN_COSTS[model as keyof typeof OPENAI_IMAGE_PERCOIN_COSTS]]).toEqual([
        model,
        cost,
      ]);
    }
  });

  it("gpt-image-2.5-flare は quality × size tier ごとに 2.0 と同額", () => {
    for (const quality of GPT_IMAGE_2_QUALITIES) {
      for (const sizeTier of GPT_IMAGE_2_SIZE_TIERS) {
        const v2 = composeOpenAIImageModel("gpt-image-2", quality, sizeTier);
        const v25 = composeOpenAIImageModel("gpt-image-2.5-flare", quality, sizeTier);
        expect([v25, OPENAI_IMAGE_PERCOIN_COSTS[v25]]).toEqual([
          v25,
          OPENAI_IMAGE_PERCOIN_COSTS[v2],
        ]);
      }
    }
  });
});

describe("toOpenAIApiModelName", () => {
  it("回帰ガード: gpt-image-2 は API モデル名 `gpt-image-2` のまま", () => {
    expect(toOpenAIApiModelName("gpt-image-2")).toBe("gpt-image-2");
  });

  it("gpt-image-2.5-flare は API モデル名 `gpt-image-2.5-flare`", () => {
    expect(toOpenAIApiModelName("gpt-image-2.5-flare")).toBe("gpt-image-2.5-flare");
  });
});

describe("isGptImage25FlareModel", () => {
  it("gpt-image-2.5-flare の canonical 9 件は true", () => {
    for (const model of GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS) {
      expect([model, isGptImage25FlareModel(model)]).toEqual([model, true]);
    }
  });

  it("gpt-image-2 の canonical と legacy alias は false(startsWith に頼らない)", () => {
    // "gpt-image-2.5-flare-low-1k".startsWith("gpt-image-2") は true になるため、
    // 逆方向(2.0 を 2.5 と誤判定)が起きないことをここで固定する(ADR-002)。
    for (const model of GPT_IMAGE_2_CANONICAL_MODELS) {
      expect([model, isGptImage25FlareModel(model)]).toEqual([model, false]);
    }
    expect(isGptImage25FlareModel(GPT_IMAGE_2_LEGACY_LOW_MODEL)).toBe(false);
  });

  it("Gemini 系・未知の値・null / undefined は false", () => {
    expect(isGptImage25FlareModel("gemini-3-pro-image-1k")).toBe(false);
    expect(isGptImage25FlareModel("gpt-image-2.5-sunburst-low-1k")).toBe(false);
    expect(isGptImage25FlareModel("gpt-image-2.5-flare-low")).toBe(false);
    expect(isGptImage25FlareModel("")).toBe(false);
    expect(isGptImage25FlareModel(null)).toBe(false);
    expect(isGptImage25FlareModel(undefined)).toBe(false);
  });
});

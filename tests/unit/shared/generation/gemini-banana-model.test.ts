import {
  GEMINI_BANANA_2_SIZE_TIERS,
  GEMINI_BANANA_CANONICAL_MODELS,
  GEMINI_BANANA_PRO_SIZE_TIERS,
  composeGeminiBananaModel,
  getDefaultCanonicalForFamily,
  getSizeTiersForFamily,
  isGeminiBananaCanonicalModel,
  parseGeminiBananaModel,
} from "@/shared/generation/gemini-banana-model";

describe("composeGeminiBananaModel", () => {
  it("nano-2 + 0.5k -> preview-512", () => {
    expect(composeGeminiBananaModel("nano-2", "0.5k")).toBe(
      "gemini-3.1-flash-image-preview-512"
    );
  });

  it("nano-2 + 1k -> preview-1024", () => {
    expect(composeGeminiBananaModel("nano-2", "1k")).toBe(
      "gemini-3.1-flash-image-preview-1024"
    );
  });

  it("nano-pro + 1k/2k/4k -> 各 canonical", () => {
    expect(composeGeminiBananaModel("nano-pro", "1k")).toBe(
      "gemini-3-pro-image-1k"
    );
    expect(composeGeminiBananaModel("nano-pro", "2k")).toBe(
      "gemini-3-pro-image-2k"
    );
    expect(composeGeminiBananaModel("nano-pro", "4k")).toBe(
      "gemini-3-pro-image-4k"
    );
  });

  it("family と size の不整合は null（nano-2 × 2k/4k、nano-pro × 0.5k）", () => {
    expect(composeGeminiBananaModel("nano-2", "2k")).toBeNull();
    expect(composeGeminiBananaModel("nano-2", "4k")).toBeNull();
    expect(composeGeminiBananaModel("nano-pro", "0.5k")).toBeNull();
  });
});

describe("parseGeminiBananaModel", () => {
  it("既知の canonical は family + sizeTier を返す", () => {
    expect(parseGeminiBananaModel("gemini-3.1-flash-image-preview-512")).toEqual(
      { canonical: "gemini-3.1-flash-image-preview-512", family: "nano-2", sizeTier: "0.5k" }
    );
    expect(
      parseGeminiBananaModel("gemini-3.1-flash-image-preview-1024")
    ).toEqual({
      canonical: "gemini-3.1-flash-image-preview-1024",
      family: "nano-2",
      sizeTier: "1k",
    });
    expect(parseGeminiBananaModel("gemini-3-pro-image-2k")).toEqual({
      canonical: "gemini-3-pro-image-2k",
      family: "nano-pro",
      sizeTier: "2k",
    });
  });

  it("Nano Banana 系以外 / 未知 / null は null", () => {
    expect(parseGeminiBananaModel("gpt-image-2-low-1k")).toBeNull();
    expect(parseGeminiBananaModel("gemini-2.5-flash-image")).toBeNull();
    expect(parseGeminiBananaModel("gemini-3-pro-image-preview")).toBeNull();
    expect(parseGeminiBananaModel("unknown-model")).toBeNull();
    expect(parseGeminiBananaModel(null)).toBeNull();
    expect(parseGeminiBananaModel(undefined)).toBeNull();
    expect(parseGeminiBananaModel("")).toBeNull();
  });

  it("compose <-> parse は往復で一致する", () => {
    for (const sizeTier of GEMINI_BANANA_2_SIZE_TIERS) {
      const canonical = composeGeminiBananaModel("nano-2", sizeTier);
      expect(canonical).not.toBeNull();
      expect(parseGeminiBananaModel(canonical!)).toEqual({
        canonical,
        family: "nano-2",
        sizeTier,
      });
    }
    for (const sizeTier of GEMINI_BANANA_PRO_SIZE_TIERS) {
      const canonical = composeGeminiBananaModel("nano-pro", sizeTier);
      expect(canonical).not.toBeNull();
      expect(parseGeminiBananaModel(canonical!)).toEqual({
        canonical,
        family: "nano-pro",
        sizeTier,
      });
    }
  });
});

describe("getSizeTiersForFamily", () => {
  it("nano-2 は 0.5k / 1k", () => {
    expect(getSizeTiersForFamily("nano-2")).toEqual(["0.5k", "1k"]);
  });

  it("nano-pro は 1k / 2k / 4k", () => {
    expect(getSizeTiersForFamily("nano-pro")).toEqual(["1k", "2k", "4k"]);
  });
});

describe("getDefaultCanonicalForFamily", () => {
  it("nano-2 の既定は 1K = preview-1024", () => {
    expect(getDefaultCanonicalForFamily("nano-2")).toBe(
      "gemini-3.1-flash-image-preview-1024"
    );
  });

  it("nano-pro の既定は 1K = pro-image-1k", () => {
    expect(getDefaultCanonicalForFamily("nano-pro")).toBe(
      "gemini-3-pro-image-1k"
    );
  });
});

describe("isGeminiBananaCanonicalModel", () => {
  it("Nano Banana 2 ファミリーの canonical を true で受ける", () => {
    expect(
      isGeminiBananaCanonicalModel("gemini-3.1-flash-image-preview-512")
    ).toBe(true);
    expect(
      isGeminiBananaCanonicalModel("gemini-3.1-flash-image-preview-1024")
    ).toBe(true);
  });

  it("Nano Banana Pro ファミリーの canonical を true で受ける", () => {
    expect(isGeminiBananaCanonicalModel("gemini-3-pro-image-1k")).toBe(true);
    expect(isGeminiBananaCanonicalModel("gemini-3-pro-image-2k")).toBe(true);
    expect(isGeminiBananaCanonicalModel("gemini-3-pro-image-4k")).toBe(true);
  });

  it("無関係なモデル ID や非文字列は false", () => {
    expect(isGeminiBananaCanonicalModel("gpt-image-2-low-1k")).toBe(false);
    expect(isGeminiBananaCanonicalModel("gemini-2.5-flash-image")).toBe(false);
    expect(isGeminiBananaCanonicalModel("unknown")).toBe(false);
    expect(isGeminiBananaCanonicalModel(null)).toBe(false);
    expect(isGeminiBananaCanonicalModel(undefined)).toBe(false);
    expect(isGeminiBananaCanonicalModel(123)).toBe(false);
  });
});

describe("GEMINI_BANANA_CANONICAL_MODELS", () => {
  it("nano-2 と nano-pro の両ファミリーの canonical を含む", () => {
    expect(GEMINI_BANANA_CANONICAL_MODELS).toContain(
      "gemini-3.1-flash-image-preview-512"
    );
    expect(GEMINI_BANANA_CANONICAL_MODELS).toContain(
      "gemini-3.1-flash-image-preview-1024"
    );
    expect(GEMINI_BANANA_CANONICAL_MODELS).toContain("gemini-3-pro-image-1k");
    expect(GEMINI_BANANA_CANONICAL_MODELS).toContain("gemini-3-pro-image-4k");
  });
});

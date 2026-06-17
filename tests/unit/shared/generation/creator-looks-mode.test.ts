import {
  CREATOR_LOOKS_MODES,
  DEFAULT_CREATOR_LOOKS_MODE,
  parseCreatorLooksMode,
  isTwoStageCreatorLooksMode,
  maxStagesForCreatorLooksMode,
  overridesForCreatorLooksMode,
  getCreatorLooksModeFromGenerationMetadata,
  creatorLooksModeFromOverrides,
} from "@/shared/generation/creator-looks-mode";

describe("parseCreatorLooksMode", () => {
  test("有効な値はそのまま、不正は null", () => {
    for (const m of CREATOR_LOOKS_MODES) {
      expect(parseCreatorLooksMode(m)).toBe(m);
    }
    expect(parseCreatorLooksMode("foo")).toBeNull();
    expect(parseCreatorLooksMode(null)).toBeNull();
    expect(parseCreatorLooksMode(undefined)).toBeNull();
    expect(parseCreatorLooksMode(123)).toBeNull();
  });
});

describe("段階数と2段階判定", () => {
  test("衣装＋背景だけ2段階", () => {
    expect(isTwoStageCreatorLooksMode("outfit_and_background")).toBe(true);
    expect(isTwoStageCreatorLooksMode("outfit_only")).toBe(false);
    expect(isTwoStageCreatorLooksMode("background_only")).toBe(false);
    expect(maxStagesForCreatorLooksMode("outfit_and_background")).toBe(2);
    expect(maxStagesForCreatorLooksMode("outfit_only")).toBe(1);
    expect(maxStagesForCreatorLooksMode("background_only")).toBe(1);
  });
});

describe("overridesForCreatorLooksMode", () => {
  test("モード→override(angle/poseは常にfalse)", () => {
    expect(overridesForCreatorLooksMode("outfit_only")).toEqual({
      outfit: true,
      angle: false,
      pose: false,
      background: false,
    });
    expect(overridesForCreatorLooksMode("outfit_and_background")).toEqual({
      outfit: true,
      angle: false,
      pose: false,
      background: true,
    });
    expect(overridesForCreatorLooksMode("background_only")).toEqual({
      outfit: false,
      angle: false,
      pose: false,
      background: true,
    });
  });
});

describe("metadata / override 逆引き", () => {
  test("generation_metadata から mode を読む", () => {
    expect(
      getCreatorLooksModeFromGenerationMetadata({
        creatorLooksMode: "background_only",
      }),
    ).toBe("background_only");
    expect(getCreatorLooksModeFromGenerationMetadata({})).toBeNull();
    expect(getCreatorLooksModeFromGenerationMetadata(null)).toBeNull();
    expect(
      getCreatorLooksModeFromGenerationMetadata({ creatorLooksMode: "x" }),
    ).toBeNull();
  });

  test("override から mode を逆引き(metadata 欠落フォールバック)", () => {
    expect(creatorLooksModeFromOverrides(true, false)).toBe("outfit_only");
    expect(creatorLooksModeFromOverrides(true, true)).toBe(
      "outfit_and_background",
    );
    expect(creatorLooksModeFromOverrides(false, true)).toBe("background_only");
    // 衣装OFF・背景OFF は実質「衣装のみ」扱い(既定)
    expect(creatorLooksModeFromOverrides(false, false)).toBe("outfit_only");
  });

  test("既定モードは outfit_only", () => {
    expect(DEFAULT_CREATOR_LOOKS_MODE).toBe("outfit_only");
  });
});

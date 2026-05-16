import {
  buildInspirePrompt,
  hasAnyInspireOverride,
  isInspireKeepAll,
  resolveInspireTargetSizeBaseIndex,
  type InspireOverrides,
} from "@/shared/generation/prompt-core";

const KEEP_ALL: InspireOverrides = {
  outfit: true,
  angle: true,
  pose: true,
  background: true,
};

const ONLY_OUTFIT: InspireOverrides = {
  outfit: true,
  angle: false,
  pose: false,
  background: false,
};

const ONLY_ANGLE: InspireOverrides = {
  outfit: false,
  angle: true,
  pose: false,
  background: false,
};

const ONLY_POSE: InspireOverrides = {
  outfit: false,
  angle: false,
  pose: true,
  background: false,
};

const ONLY_BACKGROUND: InspireOverrides = {
  outfit: false,
  angle: false,
  pose: false,
  background: true,
};

const NONE: InspireOverrides = {
  outfit: false,
  angle: false,
  pose: false,
  background: false,
};

const SINGLES: ReadonlyArray<InspireOverrides> = [
  ONLY_OUTFIT,
  ONLY_ANGLE,
  ONLY_POSE,
  ONLY_BACKGROUND,
];

describe("isInspireKeepAll", () => {
  test("4 つすべて true で true", () => {
    expect(isInspireKeepAll(KEEP_ALL)).toBe(true);
  });

  test("1 つでも false なら false", () => {
    for (const overrides of SINGLES) {
      expect(isInspireKeepAll(overrides)).toBe(false);
    }
    expect(isInspireKeepAll(NONE)).toBe(false);
  });
});

describe("hasAnyInspireOverride", () => {
  test("1 つでも true なら true", () => {
    expect(hasAnyInspireOverride(KEEP_ALL)).toBe(true);
    for (const overrides of SINGLES) {
      expect(hasAnyInspireOverride(overrides)).toBe(true);
    }
  });

  test("すべて false なら false", () => {
    expect(hasAnyInspireOverride(NONE)).toBe(false);
  });
});

describe("buildInspirePrompt", () => {
  describe("前文（必ず先頭に置く）", () => {
    test("全パターンで「絶対に守ること...」を必ず含む", () => {
      for (const overrides of [KEEP_ALL, ...SINGLES]) {
        const prompt = buildInspirePrompt({ overrides });
        expect(prompt).toContain(
          "絶対に守ること：必ずimage_0のキャラクターの体型は完全に保持してください。"
        );
      }
    });

    test("前文は必ずプロンプトの先頭にある", () => {
      const prompt = buildInspirePrompt({ overrides: KEEP_ALL });
      expect(
        prompt.startsWith(
          "絶対に守ること：必ずimage_0のキャラクターの体型は完全に保持してください。"
        )
      ).toBe(true);
    });
  });

  describe("各 override の ON / OFF に対応するアクション文", () => {
    test("outfit=true なら ON 文、false なら OFF 文", () => {
      const on = buildInspirePrompt({ overrides: ONLY_OUTFIT });
      expect(on).toContain("image_1の服をimage_0に着せて下さい。");
      expect(on).not.toContain("image_0の衣装は変えないでください。");

      const off = buildInspirePrompt({ overrides: ONLY_ANGLE });
      expect(off).toContain("image_0の衣装は変えないでください。");
      expect(off).not.toContain("image_1の服をimage_0に着せて下さい。");
    });

    test("angle=true なら ON 文、false なら OFF 文", () => {
      const on = buildInspirePrompt({ overrides: ONLY_ANGLE });
      expect(on).toContain(
        "image_1のカメラアングル同じカメラアングルをimage_0に適用させてください。"
      );
      expect(on).not.toContain("image_0のカメラアングルは変えないでください。");

      const off = buildInspirePrompt({ overrides: ONLY_OUTFIT });
      expect(off).toContain("image_0のカメラアングルは変えないでください。");
      expect(off).not.toContain(
        "image_1のカメラアングル同じカメラアングルをimage_0に適用させてください。"
      );
    });

    test("pose=true なら ON 文、false なら OFF 文", () => {
      const on = buildInspirePrompt({ overrides: ONLY_POSE });
      expect(on).toContain(
        "image_1のポーズと似たようなポーズをimage_0に適用して下さい。"
      );
      expect(on).not.toContain("image_0のポーズは変えないでください。");

      const off = buildInspirePrompt({ overrides: ONLY_OUTFIT });
      expect(off).toContain("image_0のポーズは変えないでください。");
      expect(off).not.toContain(
        "image_1のポーズと似たようなポーズをimage_0に適用して下さい。"
      );
    });

    test("background=true なら ON 文、false なら OFF 文", () => {
      const on = buildInspirePrompt({ overrides: ONLY_BACKGROUND });
      expect(on).toContain("image_1の背景と同じ背景をimage_0に適用して下さい。");
      expect(on).not.toContain("image_0の背景は変えないでください。");

      const off = buildInspirePrompt({ overrides: ONLY_OUTFIT });
      expect(off).toContain("image_0の背景は変えないでください。");
      expect(off).not.toContain(
        "image_1の背景と同じ背景をimage_0に適用して下さい。"
      );
    });

    test("すべて維持なら 4 つの ON 文すべてを含み、OFF 文は含まない", () => {
      const prompt = buildInspirePrompt({ overrides: KEEP_ALL });
      expect(prompt).toContain("image_1の服をimage_0に着せて下さい。");
      expect(prompt).toContain(
        "image_1のカメラアングル同じカメラアングルをimage_0に適用させてください。"
      );
      expect(prompt).toContain(
        "image_1のポーズと似たようなポーズをimage_0に適用して下さい。"
      );
      expect(prompt).toContain("image_1の背景と同じ背景をimage_0に適用して下さい。");
      expect(prompt).not.toContain("変えないでください。");
    });

    test("単一 ON の場合、ON 文 1 つと OFF 文 3 つを含む", () => {
      const prompt = buildInspirePrompt({ overrides: ONLY_OUTFIT });
      expect(prompt).toContain("image_1の服をimage_0に着せて下さい。");
      expect(prompt).toContain("image_0のカメラアングルは変えないでください。");
      expect(prompt).toContain("image_0のポーズは変えないでください。");
      expect(prompt).toContain("image_0の背景は変えないでください。");
    });

    test("アクション文の順序は outfit → angle → pose → background", () => {
      const prompt = buildInspirePrompt({ overrides: KEEP_ALL });
      const outfitIdx = prompt.indexOf("image_1の服をimage_0に着せて下さい。");
      const angleIdx = prompt.indexOf(
        "image_1のカメラアングル同じカメラアングルをimage_0に適用させてください。"
      );
      const poseIdx = prompt.indexOf(
        "image_1のポーズと似たようなポーズをimage_0に適用して下さい。"
      );
      const backgroundIdx = prompt.indexOf(
        "image_1の背景と同じ背景をimage_0に適用して下さい。"
      );
      expect(outfitIdx).toBeLessThan(angleIdx);
      expect(angleIdx).toBeLessThan(poseIdx);
      expect(poseIdx).toBeLessThan(backgroundIdx);
    });
  });

  describe("プロンプトの簡潔さ", () => {
    test("フレーミング指示・スタイル suffix・役割宣言を含まない（短文志向）", () => {
      for (const overrides of [KEEP_ALL, ...SINGLES]) {
        const prompt = buildInspirePrompt({ overrides });
        // 過去に持っていた装飾的な節が残っていないこと
        expect(prompt).not.toContain("アスペクト比");
        expect(prompt).not.toContain("キャンバスを拡張");
        expect(prompt).not.toContain("イラスト調");
        expect(prompt).not.toContain("写実的");
        expect(prompt).not.toContain("参照画像があります");
      }
    });
  });

  describe("安全性", () => {
    test("安全フィルタを誘発しやすい文言（chest / breast）を含まない", () => {
      for (const overrides of [KEEP_ALL, ...SINGLES]) {
        const prompt = buildInspirePrompt({ overrides }).toLowerCase();
        expect(prompt).not.toContain("chest");
        expect(prompt).not.toContain("breast");
      }
    });
  });
});

describe("resolveInspireTargetSizeBaseIndex", () => {
  test("すべて維持なら image_1 基準（1）", () => {
    expect(resolveInspireTargetSizeBaseIndex(KEEP_ALL)).toBe(1);
  });

  test("1 つでも false なら image_0 基準（0）", () => {
    for (const overrides of SINGLES) {
      expect(resolveInspireTargetSizeBaseIndex(overrides)).toBe(0);
    }
  });
});

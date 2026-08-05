/**
 * features/style-presets/lib/resolve-user-prompt-settings のテスト。
 *
 * ユーザープロンプト入力欄設定の 3 段フォールバック
 * (プリセット設定 → カテゴリ設定 → 既定) を検証する。
 * このヘルパーは /style の textarea 描画と生成 handler の長さ検証の両方で
 * 使われるため、解決順が仕様どおりであることが表示と検証の一致を保証する。
 */
import {
  resolveUserPromptLabel,
  resolveUserPromptMaxLength,
  resolveUserPromptPlaceholder,
} from "@/features/style-presets/lib/resolve-user-prompt-settings";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";

function buildPreset(overrides: {
  presetLabel?: string | null;
  presetPlaceholder?: string | null;
  presetMaxLength?: number | null;
  categoryLabel?: string | null;
  categoryPlaceholder?: string | null;
  categoryMaxLength?: number | null;
}) {
  return {
    userPromptLabel: overrides.presetLabel ?? null,
    userPromptPlaceholder: overrides.presetPlaceholder ?? null,
    userPromptMaxLength: overrides.presetMaxLength ?? null,
    category: {
      userPromptLabel: overrides.categoryLabel ?? null,
      userPromptPlaceholder: overrides.categoryPlaceholder ?? null,
      userPromptMaxLength: overrides.categoryMaxLength ?? null,
    },
  };
}

describe("resolve-user-prompt-settings", () => {
  describe("resolveUserPromptLabel", () => {
    test("プリセット設定が最優先", () => {
      const preset = buildPreset({
        presetLabel: "キャラクターの名前",
        categoryLabel: "カテゴリのラベル",
      });
      expect(resolveUserPromptLabel(preset)).toBe("キャラクターの名前");
    });

    test("プリセット未設定ならカテゴリ設定へフォールバック", () => {
      const preset = buildPreset({ categoryLabel: "カテゴリのラベル" });
      expect(resolveUserPromptLabel(preset)).toBe("カテゴリのラベル");
    });

    test("両方未設定なら null (呼び出し側が i18n 既定を使う)", () => {
      expect(resolveUserPromptLabel(buildPreset({}))).toBeNull();
    });

    test("プリセット側フィールドが undefined でもカテゴリへフォールバック", () => {
      // StylePresetPublicSummary の 3 項目は optional のため undefined があり得る
      expect(
        resolveUserPromptLabel({
          category: { userPromptLabel: "カテゴリのラベル" },
        }),
      ).toBe("カテゴリのラベル");
    });
  });

  describe("resolveUserPromptPlaceholder", () => {
    test("プリセット設定が最優先", () => {
      const preset = buildPreset({
        presetPlaceholder: "例: ラッキー",
        categoryPlaceholder: "ノエル",
      });
      expect(resolveUserPromptPlaceholder(preset)).toBe("例: ラッキー");
    });

    test("プリセット未設定ならカテゴリ設定へフォールバック", () => {
      const preset = buildPreset({ categoryPlaceholder: "ノエル" });
      expect(resolveUserPromptPlaceholder(preset)).toBe("ノエル");
    });

    test("両方未設定なら null", () => {
      expect(resolveUserPromptPlaceholder(buildPreset({}))).toBeNull();
    });
  });

  describe("resolveUserPromptMaxLength", () => {
    test("プリセット設定が最優先 (カテゴリより小さくても大きくても)", () => {
      expect(
        resolveUserPromptMaxLength(
          buildPreset({ presetMaxLength: 10, categoryMaxLength: 100 }),
        ),
      ).toBe(10);
      expect(
        resolveUserPromptMaxLength(
          buildPreset({ presetMaxLength: 300, categoryMaxLength: 100 }),
        ),
      ).toBe(300);
    });

    test("プリセット未設定ならカテゴリ設定へフォールバック", () => {
      expect(
        resolveUserPromptMaxLength(buildPreset({ categoryMaxLength: 10 })),
      ).toBe(10);
    });

    test("両方未設定なら既定 1500 (GENERATION_PROMPT_MAX_LENGTH)", () => {
      expect(resolveUserPromptMaxLength(buildPreset({}))).toBe(
        GENERATION_PROMPT_MAX_LENGTH,
      );
      expect(GENERATION_PROMPT_MAX_LENGTH).toBe(1500);
    });
  });
});

/** @jest-environment node */

import { resolveGenerationTip } from "@/features/style-presets/lib/resolve-generation-tip";

/** 解決順はユーザープロンプト入力欄と同じ「プリセット → カテゴリ → 出さない」。 */
function build({
  presetJa = null,
  presetEn = null,
  categoryJa = null,
  categoryEn = null,
}: {
  presetJa?: string | null;
  presetEn?: string | null;
  categoryJa?: string | null;
  categoryEn?: string | null;
}) {
  return {
    generationTipJa: presetJa,
    generationTipEn: presetEn,
    category: { generationTipJa: categoryJa, generationTipEn: categoryEn },
  };
}

describe("resolveGenerationTip", () => {
  test("プリセットの設定を優先する", () => {
    const preset = build({ presetJa: "スタイル固有", categoryJa: "カテゴリ既定" });
    expect(resolveGenerationTip(preset, "ja")).toBe("スタイル固有");
  });

  test("プリセットが空ならカテゴリ設定を使う", () => {
    expect(resolveGenerationTip(build({ categoryJa: "カテゴリ既定" }), "ja")).toBe(
      "カテゴリ既定"
    );
  });

  test("どちらも空なら出さない", () => {
    expect(resolveGenerationTip(build({}), "ja")).toBeNull();
  });

  test("空白だけの設定は無いものとして扱う", () => {
    const preset = build({ presetJa: "   ", categoryJa: "カテゴリ既定" });
    expect(resolveGenerationTip(preset, "ja")).toBe("カテゴリ既定");
  });

  test("英語ロケールでは英語を使う", () => {
    const preset = build({ presetJa: "日本語", presetEn: "English" });
    expect(resolveGenerationTip(preset, "en")).toBe("English");
  });

  test("英語が未入力なら日本語を出す（何も出ないより届く方がよい）", () => {
    expect(resolveGenerationTip(build({ categoryJa: "日本語だけ" }), "en")).toBe(
      "日本語だけ"
    );
  });

  test("日本語ロケールで英語だけの設定は出さない", () => {
    /*
      呼び出し側は ko/th/hi/ar もまとめて "ja" として渡す。ここで英語へ倒すと、
      英語欄だけ書いた設定が日本語・韓国語・タイ語の画面に英語のまま出る。
    */
    expect(resolveGenerationTip(build({ categoryEn: "English only" }), "ja")).toBeNull();
    expect(resolveGenerationTip(build({ presetEn: "English only" }), "ko")).toBeNull();
  });

  test("日本語以外のロケールは日本語に倒す（既存の説明文と同じ扱い）", () => {
    const preset = build({ categoryJa: "日本語", categoryEn: "English" });
    expect(resolveGenerationTip(preset, "ko")).toBe("日本語");
  });
});

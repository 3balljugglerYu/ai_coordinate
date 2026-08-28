/** @jest-environment node */

import { parseGenerationTipOverrideFields } from "@/features/style-presets/lib/parse-generation-tip-override";
import { MAX_GENERATION_TIP_LENGTH } from "@/features/style-presets/lib/generation-tip";

function formDataOf(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.append(key, value);
  }
  return formData;
}

describe("parseGenerationTipOverrideFields", () => {
  test("入力があればそのまま受け取る", () => {
    const result = parseGenerationTipOverrideFields(
      formDataOf({ generation_tip_ja: "  崩れにくいです！  " })
    );

    expect(result).toEqual({
      ok: true,
      value: { generationTipJa: "崩れにくいです！" },
    });
  });

  test("空文字は null（カテゴリ設定へ継承）", () => {
    const result = parseGenerationTipOverrideFields(
      formDataOf({ generation_tip_ja: "   " })
    );

    expect(result).toEqual({ ok: true, value: { generationTipJa: null } });
  });

  test("項目が無ければ触らない（更新時に現状維持）", () => {
    // 旧フォームからの送信で既存値を壊さないための約束
    expect(parseGenerationTipOverrideFields(new FormData())).toEqual({
      ok: true,
      value: {},
    });
  });

  test("上限を超えたらエラー", () => {
    const result = parseGenerationTipOverrideFields(
      formDataOf({ generation_tip_ja: "あ".repeat(MAX_GENERATION_TIP_LENGTH + 1) })
    );

    expect(result.ok).toBe(false);
  });

  test("日本語と英語を独立して受け取る", () => {
    const result = parseGenerationTipOverrideFields(
      formDataOf({ generation_tip_ja: "日本語", generation_tip_en: "English" })
    );

    expect(result).toEqual({
      ok: true,
      value: { generationTipJa: "日本語", generationTipEn: "English" },
    });
  });


  test("テキスト以外が来たらエラー", () => {
    const formData = new FormData();
    formData.append("generation_tip_ja", new Blob(["x"]));

    const result = parseGenerationTipOverrideFields(formData);

    expect(result.ok).toBe(false);
  });

  test("英語だけの上限超過も弾く", () => {
    const result = parseGenerationTipOverrideFields(
      formDataOf({ generation_tip_en: "a".repeat(MAX_GENERATION_TIP_LENGTH + 1) })
    );

    expect(result.ok).toBe(false);
  });
});

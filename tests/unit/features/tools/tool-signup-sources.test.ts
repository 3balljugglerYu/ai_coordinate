/**
 * ツールの流入元タグ。
 *
 * 書式を外すと `parseSignupSource` に落とされ、DB の CHECK にも弾かれる。
 * その場合**何も記録されず、しかも画面上は何も起きない**ので気づけない。
 */

import { parseSignupSource } from "@/features/auth/lib/signup-source";
import { IMAGE_SPLIT_SIGNUP_SOURCE } from "@/features/tools/lib/tool-signup-sources";

describe("IMAGE_SPLIT_SIGNUP_SOURCE", () => {
  test("⭐parseSignupSource を通る(通らないと黙って記録されない)", () => {
    expect(parseSignupSource(IMAGE_SPLIT_SIGNUP_SOURCE)).toBe(
      IMAGE_SPLIT_SIGNUP_SOURCE,
    );
  });

  test("DB の CHECK と同じ書式を満たす(小文字英数 + _ -、1..40文字)", () => {
    expect(IMAGE_SPLIT_SIGNUP_SOURCE).toMatch(/^[a-z0-9_-]{1,40}$/);
  });

  test("既存タグ(style / wardrobe)と衝突しない", () => {
    expect(["style", "wardrobe"]).not.toContain(IMAGE_SPLIT_SIGNUP_SOURCE);
  });
});

/**
 * features/style-presets/lib/parse-user-prompt-override-fields のテスト。
 *
 * admin スタイル編集 API (POST/PATCH) の FormData から、ユーザープロンプト
 * 入力欄のスタイル別上書き 3 項目を取り出す共通パーサ。検証基準はカテゴリ API
 * (app/api/admin/preset-categories) と同一: ラベル <=120 / placeholder <=200 /
 * 最大文字数 1〜1500 の整数。
 */
import {
  MAX_USER_PROMPT_LABEL_LENGTH,
  MAX_USER_PROMPT_PLACEHOLDER_LENGTH,
  parseUserPromptOverrideFields,
} from "@/features/style-presets/lib/parse-user-prompt-override-fields";

function buildFormData(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.append(key, value);
  }
  return formData;
}

describe("parse-user-prompt-override-fields", () => {
  test("エントリが 1 つも無ければ空オブジェクト (更新時は現状維持)", () => {
    const result = parseUserPromptOverrideFields(buildFormData({}));
    expect(result).toEqual({ ok: true, value: {} });
  });

  test("3 項目が揃っていれば trim して受理する", () => {
    const result = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_label: "  キャラクターの名前  ",
        user_prompt_placeholder: " 例: ラッキー ",
        user_prompt_max_length: " 10 ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        userPromptLabel: "キャラクターの名前",
        userPromptPlaceholder: "例: ラッキー",
        userPromptMaxLength: 10,
      },
    });
  });

  test("空文字は null (明示クリア = カテゴリ設定へ継承)", () => {
    const result = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_label: "",
        user_prompt_placeholder: "   ",
        user_prompt_max_length: "",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        userPromptLabel: null,
        userPromptPlaceholder: null,
        userPromptMaxLength: null,
      },
    });
  });

  test("一部のエントリだけでも受理し、残りは undefined のまま", () => {
    const result = parseUserPromptOverrideFields(
      buildFormData({ user_prompt_label: "好きなことば" }),
    );
    expect(result).toEqual({
      ok: true,
      value: { userPromptLabel: "好きなことば" },
    });
  });

  test("ラベルは 120 文字ちょうどまで受理、121 文字は拒否", () => {
    const ok = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_label: "あ".repeat(MAX_USER_PROMPT_LABEL_LENGTH),
      }),
    );
    expect(ok.ok).toBe(true);

    const tooLong = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_label: "あ".repeat(MAX_USER_PROMPT_LABEL_LENGTH + 1),
      }),
    );
    expect(tooLong.ok).toBe(false);
  });

  test("placeholder は 200 文字ちょうどまで受理、201 文字は拒否", () => {
    const ok = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_placeholder: "あ".repeat(
          MAX_USER_PROMPT_PLACEHOLDER_LENGTH,
        ),
      }),
    );
    expect(ok.ok).toBe(true);

    const tooLong = parseUserPromptOverrideFields(
      buildFormData({
        user_prompt_placeholder: "あ".repeat(
          MAX_USER_PROMPT_PLACEHOLDER_LENGTH + 1,
        ),
      }),
    );
    expect(tooLong.ok).toBe(false);
  });

  test("最大文字数は 1 と 1500 の境界を受理する", () => {
    expect(
      parseUserPromptOverrideFields(
        buildFormData({ user_prompt_max_length: "1" }),
      ),
    ).toEqual({ ok: true, value: { userPromptMaxLength: 1 } });
    expect(
      parseUserPromptOverrideFields(
        buildFormData({ user_prompt_max_length: "1500" }),
      ),
    ).toEqual({ ok: true, value: { userPromptMaxLength: 1500 } });
  });

  test.each(["0", "1501", "-5", "1.5", "abc", "10abc", "Infinity"])(
    "最大文字数 %p は拒否する",
    (value) => {
      const result = parseUserPromptOverrideFields(
        buildFormData({ user_prompt_max_length: value }),
      );
      expect(result.ok).toBe(false);
    },
  );

  test("File が送られてきたら拒否する (FormData の型混入ガード)", () => {
    const formData = new FormData();
    formData.append(
      "user_prompt_label",
      new File(["x"], "x.txt", { type: "text/plain" }),
    );
    const result = parseUserPromptOverrideFields(formData);
    expect(result.ok).toBe(false);
  });
});

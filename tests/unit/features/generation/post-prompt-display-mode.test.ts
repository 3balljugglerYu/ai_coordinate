/** @jest-environment node */

/**
 * プロンプト欄の表示モード判定のテスト。
 *
 * この判定を間違えると、非公開にしたプロンプトが第三者へ出る／派生投稿で
 * 原作者の資産が派生者のものとして表示される、という形で秘匿が崩れる。
 * 分岐の優先順位を固定しておく（計画書 REQ-013 / ADR-004）。
 */

import {
  getPostPromptDisplayMode,
  type PostPromptDisplayMode,
} from "@/features/generation/lib/prompt-visibility";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

type Record = Pick<
  GeneratedImageRecord,
  "prompt" | "generation_type" | "prompt_visibility" | "source_post_id"
>;

const ORIGIN_POST_ID = "11111111-1111-4111-8111-111111111111";

function build(overrides: Partial<Record> = {}): Record {
  return {
    prompt: "白いワンピースにして",
    generation_type: "free",
    prompt_visibility: "public",
    source_post_id: null,
    ...overrides,
  };
}

function mode(
  overrides: Partial<Record> = {},
  options?: { isOwner?: boolean }
): PostPromptDisplayMode {
  return getPostPromptDisplayMode(build(overrides), options);
}

describe("公開プロンプト", () => {
  it("本文があれば prompt", () => {
    expect(mode()).toBe("prompt");
  });

  it("本文が空なら none", () => {
    expect(mode({ prompt: "" })).toBe("none");
  });

  it("空白だけの本文も none", () => {
    // 空白を prompt 扱いにすると、空のプロンプト欄だけが残る
    expect(mode({ prompt: "   \n " })).toBe("none");
  });
});

describe("root の非公開プロンプト", () => {
  it("第三者には参照カード", () => {
    expect(mode({ prompt_visibility: "private" })).toBe("source_reference");
  });

  it("本人には本文を出す", () => {
    // 自分が書いた文章を確認できないと編集もできない。
    // 他人へ見せないことが目的なので、本人への開示は目的に反しない。
    expect(mode({ prompt_visibility: "private" }, { isOwner: true })).toBe(
      "prompt"
    );
  });

  it("本人でも本文が空なら none", () => {
    expect(
      mode({ prompt_visibility: "private", prompt: "" }, { isOwner: true })
    ).toBe("none");
  });
});

describe("派生投稿", () => {
  it("常に参照カード", () => {
    expect(mode({ source_post_id: ORIGIN_POST_ID })).toBe("source_reference");
  });

  it("派生投稿の本人にも本文は出さない", () => {
    // 派生者は原作者のプロンプトを所有していない。
    // ここが prompt になると、派生しただけで原作の本文を読めてしまう。
    expect(
      mode({ source_post_id: ORIGIN_POST_ID }, { isOwner: true })
    ).toBe("source_reference");
  });

  it("prompt 列に値が残っていても参照カードのまま", () => {
    // DB の CHECK で常に空だが、判定が列の中身に依存しないことを固定する
    expect(
      mode({ source_post_id: ORIGIN_POST_ID, prompt: "漏れた本文" })
    ).toBe("source_reference");
  });

  it("公開指定されていても参照カード", () => {
    // trigger が private へ強制するが、判定側も公開へ倒れない
    expect(
      mode({ source_post_id: ORIGIN_POST_ID, prompt_visibility: "public" })
    ).toBe("source_reference");
  });
});

describe("One-Tap Style", () => {
  it("生成した本人にも本文を出さない（既存挙動）", () => {
    expect(
      mode({ generation_type: "one_tap_style" }, { isOwner: true })
    ).toBe("one_tap_style");
  });

  it("派生元がある場合は参照カードが優先される", () => {
    // 実際には起こらない組み合わせだが、優先順位を固定する。
    // 派生は free 限定なので one_tap_style へ落ちてはならない。
    expect(
      mode({
        generation_type: "one_tap_style",
        source_post_id: ORIGIN_POST_ID,
      })
    ).toBe("source_reference");
  });
});

describe("列が無い既存レコード", () => {
  it("prompt_visibility 未設定は公開として扱う", () => {
    // 適用前に作られた行や select で列を落とした経路でも既存挙動を保つ
    expect(
      getPostPromptDisplayMode({
        prompt: "夏服にして",
        generation_type: "coordinate",
      })
    ).toBe("prompt");
  });
});

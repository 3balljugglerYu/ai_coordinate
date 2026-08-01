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
  shouldShowPromptWithCard,
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

describe("/free の root 投稿", () => {
  it("公開なら本文も併記する", () => {
    // 公開している以上、読める場所が要る。カードは呼び出し側が本文の上へ並べる
    expect(mode({ prompt_visibility: "public" })).toBe("prompt");
  });

  it("非公開なら第三者には参照カードだけ", () => {
    expect(mode({ prompt_visibility: "private" })).toBe("source_reference");
  });

  it("本人には公開設定によらず本文を出す", () => {
    // 自分が書いた文章を確認できないと編集もできない
    expect(mode({ prompt_visibility: "private" }, { isOwner: true })).toBe(
      "prompt"
    );
    expect(mode({ prompt_visibility: "public" }, { isOwner: true })).toBe(
      "prompt"
    );
  });

  it("本文の有無では決めない", () => {
    // 本人以外の本文は payload に載せず、必要になってから取りに行く。
    // ここで本文の長さを見ると、取得前に「本文なし」と判定してしまう。
    expect(mode({ prompt: "", prompt_visibility: "public" })).toBe("prompt");
    expect(mode({ prompt: "" }, { isOwner: true })).toBe("prompt");
  });
});

describe("coordinate（対象外）", () => {
  it("本文があれば prompt", () => {
    expect(mode({ generation_type: "coordinate" })).toBe("prompt");
  });

  it("本文が空なら none", () => {
    expect(mode({ generation_type: "coordinate", prompt: "" })).toBe("none");
  });

  it("空白だけの本文も none", () => {
    // 空白を prompt 扱いにすると、空のプロンプト欄だけが残る
    expect(mode({ generation_type: "coordinate", prompt: "   \n " })).toBe(
      "none"
    );
  });
});

describe("カードと本文の併記", () => {
  it("公開プロンプトなら第三者にも併記する", () => {
    expect(shouldShowPromptWithCard(build({ prompt_visibility: "public" }))).toBe(
      true
    );
  });

  it("非公開プロンプトは第三者には併記しない", () => {
    expect(
      shouldShowPromptWithCard(build({ prompt_visibility: "private" }))
    ).toBe(false);
  });

  it("本人には公開設定によらず併記する", () => {
    // 利用数はカードにしか出ないので、作者が見られるようにする
    expect(
      shouldShowPromptWithCard(build({ prompt_visibility: "private" }), {
        isOwner: true,
      })
    ).toBe(true);
  });

  it("派生投稿では false", () => {
    // 派生者は原作者のプロンプトを所有していない
    expect(
      shouldShowPromptWithCard(build({ source_post_id: ORIGIN_POST_ID }), {
        isOwner: true,
      })
    ).toBe(false);
  });

  it("coordinate では false", () => {
    expect(
      shouldShowPromptWithCard(build({ generation_type: "coordinate" }), {
        isOwner: true,
      })
    ).toBe(false);
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
  it("coordinate は従来どおり本文を出す", () => {
    // 適用前に作られた行や select で列を落とした経路でも既存挙動を保つ
    expect(
      getPostPromptDisplayMode({
        prompt: "夏服にして",
        generation_type: "coordinate",
      })
    ).toBe("prompt");
  });
});

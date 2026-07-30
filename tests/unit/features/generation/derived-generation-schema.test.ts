/** @jest-environment node */

/**
 * 派生生成リクエストのバリデーションのテスト。
 *
 * 派生生成は「原作の投稿 ID だけを受け取り、本文はサーバー側で解決する」設計。
 * クライアントへプロンプトを渡さないことが機能の前提なので、
 * 「本文と原作 ID を同時に送れない」ことをスキーマで固定する。
 *
 * 同時指定を許すと、どちらを使うか曖昧になるだけでなく、原作の認可だけ借りて
 * 本文を差し替える余地が残る（計画書 ADR-006 / REQ-005）。
 */

import { generationRequestSchema } from "@/features/generation/lib/schema";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function parse(input: Record<string, unknown>) {
  return generationRequestSchema.safeParse({
    sourceImageBase64: "data",
    sourceImageMimeType: "image/png",
    ...input,
  });
}

describe("通常生成", () => {
  it("本文があれば通る", () => {
    const result = parse({ prompt: "夏服にして" });

    expect(result.success).toBe(true);
  });

  it("本文が無ければ落ちる", () => {
    // フィールドから min(1) を外したので、superRefine 側で担保する
    const result = parse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "着せ替え内容を入力してください"
      );
    }
  });

  it("空文字も落ちる", () => {
    const result = parse({ prompt: "" });

    expect(result.success).toBe(false);
  });
});

describe("派生生成", () => {
  it("原作 ID だけなら通る（本文を送らない）", () => {
    const result = parse({ sourcePostId: VALID_UUID, generationType: "free" });

    expect(result.success).toBe(true);
  });

  it("generationType を省略すると落ちる", () => {
    // generationType には default('coordinate') があるため、省略すると
    // free 以外として通ってしまう。fail closed であることを固定する。
    const result = parse({ sourcePostId: VALID_UUID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "派生生成はじゆうモードのみ利用できます"
      );
    }
  });

  it("free 以外の generationType は落ちる", () => {
    // coordinate の builder は本文を運営プリセットと結合するため、
    // 原作者の本文がそこへ流れ込む経路を作ってはいけない。
    for (const generationType of ["coordinate", "one_tap_style", "inspire"]) {
      const result = parse({ sourcePostId: VALID_UUID, generationType });

      expect(result.success).toBe(false);
    }
  });

  it("本文と同時指定は落ちる", () => {
    // 原作の認可だけ借りて本文を差し替える余地を残さない
    const result = parse({
      sourcePostId: VALID_UUID,
      generationType: "free",
      prompt: "別の指示",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "派生生成では着せ替え内容を指定できません"
      );
    }
  });

  it("空文字の本文でも同時指定として落ちる", () => {
    // undefined と "" を区別する。"" を許すと「本文を送ったが空」の経路が残る。
    const result = parse({
      sourcePostId: VALID_UUID,
      generationType: "free",
      prompt: "",
    });

    expect(result.success).toBe(false);
  });

  it("UUID でない原作 ID は落ちる", () => {
    const result = parse({ sourcePostId: "not-a-uuid", generationType: "free" });

    expect(result.success).toBe(false);
  });
});

describe("本文の上限", () => {
  it("じゆうモードの上限を超えると落ちる", () => {
    const result = parse({
      prompt: "あ".repeat(30001),
      generationType: "free",
    });

    expect(result.success).toBe(false);
  });

  it("派生生成では本文の上限判定に入らない", () => {
    // 本文を持たないので長さ検証の対象外。ここが落ちると派生が使えない。
    const result = parse({ sourcePostId: VALID_UUID, generationType: "free" });

    expect(result.success).toBe(true);
  });
});

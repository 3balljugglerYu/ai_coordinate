/** @jest-environment node */

/**
 * ブラウザ側のプロンプト読み取り解決のテスト。
 *
 * サーバー側と違い service role を使えないため、他人の本文を返さない保証は
 * RLS（`auth.uid() = prompt_owner_id`）に委ねている。したがってここで固定
 * するのは「開示してよい種別だけを、正しい優先順位で解決するか」である。
 *
 * one_tap_style で legacy 列へ落ちると、運営が組み立てたプリセット全文が
 * 本人の画面に出る。サーバー側と同じ判定になっていることを確かめる。
 */

const inMock = jest.fn();
const selectMock = jest.fn(() => ({ in: inMock }));
const fromMock = jest.fn(() => ({ select: selectMock }));

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: fromMock }),
}));

import { resolveOwnVisiblePrompts } from "@/features/generation/lib/prompt-secrets-client";

beforeEach(() => {
  inMock.mockReset();
  selectMock.mockClear();
  fromMock.mockClear();
  inMock.mockResolvedValue({ data: [], error: null });
});

describe("resolveOwnVisiblePrompts", () => {
  it("secret があれば secret を返す", async () => {
    inMock.mockResolvedValue({
      data: [{ image_id: "img-1", prompt: "本人の入力" }],
      error: null,
    });

    const result = await resolveOwnVisiblePrompts([
      { id: "img-1", prompt: "legacy 値", generation_type: "free" },
    ]);

    expect(result[0].prompt).toBe("本人の入力");
  });

  it("secret が無ければ legacy 列へ落とす", async () => {
    // backfill 前の既存行はまだ secret を持たない
    const result = await resolveOwnVisiblePrompts([
      { id: "img-1", prompt: "legacy 値", generation_type: "coordinate" },
    ]);

    expect(result[0].prompt).toBe("legacy 値");
  });

  it("one_tap_style は secret が無くても legacy へ落とさない", async () => {
    // 運営が組み立てたプリセット全文。生成した本人にも開示しない。
    const result = await resolveOwnVisiblePrompts([
      {
        id: "img-1",
        prompt: "CRITICAL INSTRUCTION: ...",
        generation_type: "one_tap_style",
      },
    ]);

    expect(result[0].prompt).toBe("");
  });

  it("inspire も開示しない", async () => {
    const result = await resolveOwnVisiblePrompts([
      { id: "img-1", prompt: "creator-looks", generation_type: "inspire" },
    ]);

    expect(result[0].prompt).toBe("");
  });

  it("開示不可の種別だけなら問い合わせない", async () => {
    await resolveOwnVisiblePrompts([
      { id: "img-1", prompt: "x", generation_type: "one_tap_style" },
    ]);

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("複数レコードを1回のクエリで解決する", async () => {
    inMock.mockResolvedValue({
      data: [{ image_id: "img-2", prompt: "B の入力" }],
      error: null,
    });

    const result = await resolveOwnVisiblePrompts([
      { id: "img-1", prompt: "legacy A", generation_type: "coordinate" },
      { id: "img-2", prompt: "legacy B", generation_type: "free" },
    ]);

    expect(inMock).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.prompt)).toEqual(["legacy A", "B の入力"]);
  });

  it("取得に失敗したら legacy へ落とさず投げる", async () => {
    // 障害時に legacy へフォールバックすると秘匿境界が緩む方向へ倒れる
    inMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      resolveOwnVisiblePrompts([
        { id: "img-1", prompt: "legacy 値", generation_type: "free" },
      ])
    ).rejects.toThrow("PROMPT_SECRET_LOOKUP_FAILED");
  });

  it("空配列ではクエリを投げない", async () => {
    const result = await resolveOwnVisiblePrompts([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("変化が無いレコードは同一参照のまま返す", async () => {
    const record = {
      id: "img-1",
      prompt: "legacy 値",
      generation_type: "coordinate" as const,
    };

    const [resolved] = await resolveOwnVisiblePrompts([record]);

    expect(resolved).toBe(record);
  });
});

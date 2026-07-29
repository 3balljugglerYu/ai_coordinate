/** @jest-environment node */

/**
 * プロンプト読み取り解決のテスト。
 *
 * 本文の正本は service-only の author secret で、generated_images.prompt は
 * 移行期間の互換用にすぎない（ADR-001）。ここでは「開示してよい種別だけを、
 * 正しい優先順位で返すか」を固定する。
 *
 * 特に重要なのは、secret が無いときに legacy 列へ落ちてよい種別と、
 * 落ちてはいけない種別を取り違えないこと。one_tap_style で落ちると
 * 運営が組み立てたプリセット全文が露出する。
 */

const inMock = jest.fn();
const selectMock = jest.fn(() => ({ in: inMock }));
const fromMock = jest.fn(() => ({ select: selectMock }));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { resolveVisiblePrompts } from "@/features/generation/lib/prompt-secrets";

beforeEach(() => {
  inMock.mockReset();
  selectMock.mockClear();
  fromMock.mockClear();
  inMock.mockResolvedValue({ data: [], error: null });
});

describe("resolveVisiblePrompts", () => {
  it("secret があれば secret を返す", async () => {
    inMock.mockResolvedValue({
      data: [{ image_id: "img-1", prompt: "秘密の入力" }],
      error: null,
    });

    const result = await resolveVisiblePrompts([
      { id: "img-1", prompt: "legacy 値", generation_type: "free" },
    ]);

    expect(result[0].prompt).toBe("秘密の入力");
  });

  it("secret が無ければ legacy 列へ落とす", async () => {
    // backfill 前の既存行はまだ secret を持たない
    const result = await resolveVisiblePrompts([
      { id: "img-1", prompt: "legacy 値", generation_type: "coordinate" },
    ]);

    expect(result[0].prompt).toBe("legacy 値");
  });

  it("one_tap_style は secret が無くても legacy へ落とさない", async () => {
    // 運営が組み立てたプリセット全文。生成した本人にも開示しない。
    // ここで落とすと「secret が無い」ことを理由に運営資産が露出する。
    const result = await resolveVisiblePrompts([
      {
        id: "img-1",
        prompt: "CRITICAL INSTRUCTION: ...",
        generation_type: "one_tap_style",
      },
    ]);

    expect(result[0].prompt).toBe("");
  });

  it("inspire も開示しない", async () => {
    // "inspire" / "creator-looks" のマーカー値しか入っておらず開示の意味がない
    const result = await resolveVisiblePrompts([
      { id: "img-1", prompt: "creator-looks", generation_type: "inspire" },
    ]);

    expect(result[0].prompt).toBe("");
  });

  it("開示不可の種別は secret を引きにいかない", async () => {
    await resolveVisiblePrompts([
      { id: "img-1", prompt: "x", generation_type: "one_tap_style" },
      { id: "img-2", prompt: "y", generation_type: "inspire" },
    ]);

    // 無駄なクエリを投げない。ID を渡すこと自体が漏洩経路にはならないが、
    // 一覧表示のたびに引くコストを避ける。
    expect(inMock).not.toHaveBeenCalled();
  });

  it("複数レコードを1回のクエリで解決する", async () => {
    inMock.mockResolvedValue({
      data: [
        { image_id: "img-1", prompt: "A の入力" },
        { image_id: "img-2", prompt: "B の入力" },
      ],
      error: null,
    });

    const result = await resolveVisiblePrompts([
      { id: "img-1", prompt: "legacy A", generation_type: "free" },
      { id: "img-2", prompt: "legacy B", generation_type: "coordinate" },
      { id: "img-3", prompt: "legacy C", generation_type: "free" },
    ]);

    expect(inMock).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.prompt)).toEqual([
      "A の入力",
      "B の入力",
      "legacy C",
    ]);
  });

  it("取得に失敗したら legacy へ落とさず投げる", async () => {
    // 障害時に legacy へフォールバックすると、秘匿境界が緩む方向へ倒れる。
    // Phase 0C 以降は legacy 列が空なので、落としても結局表示できない。
    inMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      resolveVisiblePrompts([
        { id: "img-1", prompt: "legacy 値", generation_type: "free" },
      ])
    ).rejects.toThrow("PROMPT_SECRET_LOOKUP_FAILED");
  });

  it("空配列ではクエリを投げない", async () => {
    const result = await resolveVisiblePrompts([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("変化が無いレコードは同一参照のまま返す", async () => {
    const record = {
      id: "img-1",
      prompt: "legacy 値",
      generation_type: "free" as const,
    };

    const [resolved] = await resolveVisiblePrompts([record]);

    expect(resolved).toBe(record);
  });
});

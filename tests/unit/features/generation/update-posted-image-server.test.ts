/** @jest-environment node */

const createClientMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

import { updatePostedImageServer } from "@/features/generation/lib/server-database";

type UpdateArg = Record<string, unknown>;

function buildSupabaseMock(result: {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}) {
  const capturedUpdate: UpdateArg[] = [];
  const capturedEq: Array<[string, unknown]> = [];

  const maybeSingle = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ maybeSingle }));
  type Filter = {
    eq: (column: string, value: unknown) => Filter;
    select: typeof select;
  };
  const filter: Filter = {
    eq: jest.fn((column: string, value: unknown): Filter => {
      capturedEq.push([column, value]);
      return filter;
    }),
    select,
  };
  const update = jest.fn((arg: UpdateArg) => {
    capturedUpdate.push(arg);
    return filter;
  });
  const from = jest.fn(() => ({ update }));

  return { client: { from }, capturedUpdate, capturedEq };
}

describe("updatePostedImageServer", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("編集では posted_at と is_posted を書かない", async () => {
    const mock = buildSupabaseMock({
      data: {
        id: "img-1",
        is_posted: true,
        caption: "edited",
        posted_at: "2026-09-01T00:00:00.000Z",
      },
      error: null,
    });
    createClientMock.mockReturnValue(mock.client);

    const result = await updatePostedImageServer("img-1", "edited");

    expect(mock.capturedUpdate).toHaveLength(1);
    expect(mock.capturedUpdate[0]).toEqual({ caption: "edited" });
    expect(mock.capturedUpdate[0]).not.toHaveProperty("posted_at");
    expect(mock.capturedUpdate[0]).not.toHaveProperty("is_posted");
    // 元の投稿日時がそのまま返る
    expect(result.posted_at).toBe("2026-09-01T00:00:00.000Z");
  });

  test("説明・Before 表示・公開設定は更新する", async () => {
    const mock = buildSupabaseMock({
      data: { id: "img-1", is_posted: true, caption: null },
      error: null,
    });
    createClientMock.mockReturnValue(mock.client);

    await updatePostedImageServer("img-1", "", false, "private");

    expect(mock.capturedUpdate[0]).toEqual({
      caption: null,
      show_before_image: false,
      prompt_visibility: "private",
    });
  });

  test("対象を投稿済みに絞る", async () => {
    const mock = buildSupabaseMock({
      data: { id: "img-1", is_posted: true, caption: "x" },
      error: null,
    });
    createClientMock.mockReturnValue(mock.client);

    await updatePostedImageServer("img-1", "x");

    expect(mock.capturedEq).toEqual(
      expect.arrayContaining([
        ["id", "img-1"],
        ["is_posted", true],
      ])
    );
  });

  test("未投稿の画像は 0 行になり、公開せずに例外を投げる", async () => {
    const mock = buildSupabaseMock({ data: null, error: null });
    createClientMock.mockReturnValue(mock.client);

    await expect(updatePostedImageServer("img-1", "x")).rejects.toThrow(
      /post_not_posted/
    );
  });

  test("DB エラー時はトリガーのメッセージを残して例外を投げる", async () => {
    const mock = buildSupabaseMock({
      data: null,
      error: {
        message: "prompt_visibility=private は generation_type=free のみ: coordinate",
      },
    });
    createClientMock.mockReturnValue(mock.client);

    await expect(
      updatePostedImageServer("img-1", "x", undefined, "private")
    ).rejects.toThrow(/prompt_visibility=private/);
  });
});

/** @jest-environment node */

/**
 * バッチ取得ヘルパーのチャンク分割の回帰テスト。
 * かつて「100件超で throw」だったため、ホームの「オススメ」(先週投稿の全件集計)が
 * 週の投稿数100件超えと同時にSSRごと落ちた(2026-07-12 本番障害)。
 * 100件超の入力で throw せず、チャンクに分けて取得・結合されることを保証する。
 */

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import {
  getLikeCountsBatch,
  getCommentCountsBatch,
  getLikeCountsByRangeBatch,
  getUserLikeStatusesBatch,
} from "@/features/posts/lib/server-api";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;

/**
 * .from().select().in().is().eq().gte().lte() をどの順で繋いでも動くフェイククライアント。
 * in() で受けた ID チャンクを記録し、await 時に該当行だけ返す。
 */
function makeFakeClient(rows: Record<string, string>[], idColumn: string) {
  const inCalls: string[][] = [];
  function makeChain() {
    let chunkIds: string[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "is", "eq", "gte", "lte"]) {
      chain[method] = jest.fn(() => chain);
    }
    chain.in = jest.fn((_col: string, ids: string[]) => {
      chunkIds = ids;
      inCalls.push(ids);
      return chain;
    });
    chain.then = (
      resolve: (v: { data: Record<string, string>[]; error: null }) => void,
    ) =>
      resolve({
        data: rows.filter((r) => chunkIds.includes(r[idColumn])),
        error: null,
      });
    return chain;
  }
  const client = { from: jest.fn(() => makeChain()) };
  return { client: client as unknown as SupabaseClient, inCalls };
}

const MANY_IDS = Array.from({ length: 150 }, (_, i) => `id-${i}`);

describe("バッチ取得ヘルパーのチャンク分割", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getLikeCountsBatch_150件入力でthrowせず100+50に分割して集計する", async () => {
    const { client, inCalls } = makeFakeClient(
      [
        { image_id: "id-0" },
        { image_id: "id-0" },
        { image_id: "id-120" },
      ],
      "image_id",
    );

    const counts = await getLikeCountsBatch(MANY_IDS, client);

    expect(inCalls.map((c) => c.length)).toEqual([100, 50]);
    expect(counts["id-0"]).toBe(2);
    expect(counts["id-120"]).toBe(1);
    expect(counts["id-5"]).toBe(0);
    expect(Object.keys(counts)).toHaveLength(150);
  });

  test("getCommentCountsBatch_150件入力でthrowせず分割して集計する", async () => {
    const { client, inCalls } = makeFakeClient(
      [{ image_id: "id-101" }],
      "image_id",
    );

    const counts = await getCommentCountsBatch(MANY_IDS, client);

    expect(inCalls.map((c) => c.length)).toEqual([100, 50]);
    expect(counts["id-101"]).toBe(1);
    expect(counts["id-1"]).toBe(0);
  });

  test("getLikeCountsByRangeBatch_150件入力でthrowせず分割して集計する", async () => {
    const { client, inCalls } = makeFakeClient(
      [{ image_id: "id-99" }, { image_id: "id-149" }],
      "image_id",
    );

    const counts = await getLikeCountsByRangeBatch(MANY_IDS, "week", client);

    expect(inCalls.map((c) => c.length)).toEqual([100, 50]);
    expect(counts["id-99"]).toBe(1);
    expect(counts["id-149"]).toBe(1);
  });

  test("getUserLikeStatusesBatch_150件入力でthrowせず分割して判定する", async () => {
    const { client, inCalls } = makeFakeClient(
      [{ image_id: "id-130" }],
      "image_id",
    );
    mockCreateClient.mockResolvedValue(client as never);

    const statuses = await getUserLikeStatusesBatch(MANY_IDS, "user-1");

    expect(inCalls.map((c) => c.length)).toEqual([100, 50]);
    expect(statuses["id-130"]).toBe(true);
    expect(statuses["id-0"]).toBe(false);
  });

  test("100件以下は従来どおり1回のクエリで取得する", async () => {
    const { client, inCalls } = makeFakeClient([{ image_id: "a" }], "image_id");

    const counts = await getLikeCountsBatch(["a", "b"], client);

    expect(inCalls).toHaveLength(1);
    expect(counts).toEqual({ a: 1, b: 0 });
  });
});

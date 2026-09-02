/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/posts/lib/server-api", () => ({
  enrichPosts: jest.fn(),
  getPosts: jest.fn(),
}));

import {
  POPULAR_PROMPTS_STALE_AFTER_MS,
  getPopularPrompts,
} from "@/features/posts/lib/popular-prompts-api";
import { enrichPosts, getPosts } from "@/features/posts/lib/server-api";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockEnrichPosts = enrichPosts as jest.MockedFunction<typeof enrichPosts>;
const mockGetPosts = getPosts as jest.MockedFunction<typeof getPosts>;

type RankingRow = { post_id: string; rank_position: number; is_new: boolean };
type PostRow = { id: string };

/**
 * getPopularPrompts が使う 3 つの呼び出しだけを備えたスタブ。
 *   1. popular_prompt_rankings から computed_at を 1 行
 *   2. rpc("get_popular_prompt_page")
 *   3. generated_images を id の集合で取得
 */
function createSupabaseStub(options: {
  computedAt?: string | null;
  freshnessError?: { message: string } | null;
  ranking?: RankingRow[];
  rankingError?: { message: string } | null;
  postRows?: PostRow[];
  postsError?: { message: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: options.ranking ?? [],
    error: options.rankingError ?? null,
  });

  const from = jest.fn((table: string) => {
    if (table === "popular_prompt_rankings") {
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data:
                  options.computedAt === undefined
                    ? { computed_at: new Date().toISOString() }
                    : options.computedAt === null
                      ? null
                      : { computed_at: options.computedAt },
                error: options.freshnessError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        in: async () => ({
          data: options.postRows ?? [],
          error: options.postsError ?? null,
        }),
      }),
    };
  });

  return { from, rpc } as unknown as ReturnType<typeof createAdminClient> & {
    from: jest.Mock;
    rpc: jest.Mock;
  };
}

describe("getPopularPrompts", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetPosts.mockResolvedValue([]);
    // 既定は「渡された行をそのまま返す」。並び替えの検証を素通しにする
    mockEnrichPosts.mockImplementation(async (rows) => rows as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("鮮度チェックのフォールバック", () => {
    test("一度も計算されていなければ新着順に倒す", async () => {
      const stub = createSupabaseStub({ computedAt: null });
      mockCreateAdminClient.mockReturnValue(stub);

      await getPopularPrompts(20, 0, "u1");

      expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined, "u1");
      expect(stub.rpc).not.toHaveBeenCalled();
    });

    test("閾値より古ければ新着順に倒す", async () => {
      const stale = new Date(
        Date.now() - POPULAR_PROMPTS_STALE_AFTER_MS - 60_000
      ).toISOString();
      const stub = createSupabaseStub({ computedAt: stale });
      mockCreateAdminClient.mockReturnValue(stub);

      await getPopularPrompts(20, 0, "u1");

      expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined, "u1");
      expect(stub.rpc).not.toHaveBeenCalled();
    });

    test("閾値の内側なら順位を使う", async () => {
      const fresh = new Date(
        Date.now() - POPULAR_PROMPTS_STALE_AFTER_MS + 60_000
      ).toISOString();
      const stub = createSupabaseStub({
        computedAt: fresh,
        ranking: [{ post_id: "p1", rank_position: 1, is_new: false }],
        postRows: [{ id: "p1" }],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 0, "u1");

      expect(stub.rpc).toHaveBeenCalledWith("get_popular_prompt_page", {
        p_viewer_id: "u1",
        p_limit: 20,
        p_offset: 0,
      });
      expect(mockGetPosts).not.toHaveBeenCalled();
      expect(posts).toHaveLength(1);
    });

    test("鮮度クエリが失敗しても落とさず新着順に倒す", async () => {
      const stub = createSupabaseStub({
        freshnessError: { message: "boom" },
      });
      mockCreateAdminClient.mockReturnValue(stub);

      await getPopularPrompts(20, 0, null);

      expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined, null);
    });

    test("順位RPCが失敗しても落とさず新着順に倒す", async () => {
      const stub = createSupabaseStub({
        rankingError: { message: "boom" },
      });
      mockCreateAdminClient.mockReturnValue(stub);

      await getPopularPrompts(20, 0, null);

      expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined, null);
    });
  });

  describe("並び順と 🆕", () => {
    /*
      `.in()` は順序を保証しない。順位テーブルの並びへ戻せていないと、
      無限スクロールの各ページ内で順序が崩れる。
    */
    test("取得行が順不同でも順位の並びに戻す", async () => {
      const stub = createSupabaseStub({
        ranking: [
          { post_id: "p1", rank_position: 1, is_new: false },
          { post_id: "p2", rank_position: 2, is_new: true },
          { post_id: "p3", rank_position: 3, is_new: false },
        ],
        // DB から返る順序は順位と一致しない
        postRows: [{ id: "p3" }, { id: "p1" }, { id: "p2" }],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 0, null);

      expect(posts.map((post) => post.id)).toEqual(["p1", "p2", "p3"]);
      expect(posts.map((post) => post.isNew)).toEqual([false, true, false]);
    });

    test("順位にあるのに投稿行が引けなければ落とす", async () => {
      const stub = createSupabaseStub({
        ranking: [
          { post_id: "p1", rank_position: 1, is_new: false },
          { post_id: "gone", rank_position: 2, is_new: false },
        ],
        postRows: [{ id: "p1" }],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 0, null);

      expect(posts.map((post) => post.id)).toEqual(["p1"]);
    });

    test("順位が空なら新着順へは倒さず空配列を返す", async () => {
      // 末尾ページ（offset が件数を超えた）と鮮度切れは別物として扱う
      const stub = createSupabaseStub({ ranking: [] });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 200, null);

      expect(posts).toEqual([]);
      expect(mockGetPosts).not.toHaveBeenCalled();
    });
  });

  test("閲覧者IDはそのままRPCへ渡す（除外をDB側で効かせる）", async () => {
    const stub = createSupabaseStub({ ranking: [] });
    mockCreateAdminClient.mockReturnValue(stub);

    await getPopularPrompts(10, 30, "viewer-1");

    expect(stub.rpc).toHaveBeenCalledWith("get_popular_prompt_page", {
      p_viewer_id: "viewer-1",
      p_limit: 10,
      p_offset: 30,
    });
  });
});

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

type RankingRow = {
  post: { id: string };
  rank_position: number;
  is_new: boolean;
};

/** 順位 1 件ぶんの RPC 行を組み立てる。投稿本体は RPC が同じ 1 文で返す。 */
function rankingRow(id: string, position: number, isNew = false): RankingRow {
  return { post: { id }, rank_position: position, is_new: isNew };
}

/**
 * getPopularPrompts が使う 2 つの呼び出しだけを備えたスタブ。
 *   1. popular_prompt_rankings から computed_at を 1 行
 *   2. rpc("get_popular_prompt_page")  ← 投稿本体もここで返る
 *
 * ⭐ generated_images への SELECT は**あってはならない**。
 *    ID だけ受け取って別文で引くと、2 文の間の状態変化で除外が効かなくなり、
 *    行が消えると件数が limit を下回って hasMore が誤る（PR #590 の指摘）。
 *    from("generated_images") が呼ばれたらテストを落とす。
 */
function createSupabaseStub(options: {
  computedAt?: string | null;
  freshnessError?: { message: string } | null;
  ranking?: RankingRow[];
  rankingError?: { message: string } | null;
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
    throw new Error(
      `投稿本体は RPC が返すべきで、${table} への追加クエリを発行してはいけない`
    );
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
        ranking: [rankingRow("p1", 1)],
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
    test("RPC が返した順序をそのまま保ち_🆕を紐づける", async () => {
      const stub = createSupabaseStub({
        ranking: [
          rankingRow("p1", 1),
          rankingRow("p2", 2, true),
          rankingRow("p3", 3),
        ],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 0, null);

      expect(posts.map((post) => post.id)).toEqual(["p1", "p2", "p3"]);
      expect(posts.map((post) => post.isNew)).toEqual([false, true, false]);
    });

    /*
      ⭐ 本体を別クエリで引かないこと自体をテストで固定する。
      スタブは generated_images へのアクセスで例外を投げる。
    */
    test("⭐投稿本体を別クエリで引かない（同一スナップショットに閉じる）", async () => {
      const stub = createSupabaseStub({
        ranking: [rankingRow("p1", 1), rankingRow("p2", 2)],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(20, 0, null);

      expect(posts).toHaveLength(2);
      // rpc 以外のテーブルアクセスは鮮度チェックの 1 回だけ
      expect(stub.from).toHaveBeenCalledTimes(1);
      expect(stub.from).toHaveBeenCalledWith("popular_prompt_rankings");
    });

    /*
      ⭐ 除外で件数が減っても、返す件数は RPC が LIMIT 後に決めた件数と一致する。
      これが崩れると route の hasMore = posts.length === limit が誤り、
      無限スクロールが途中で止まる。
    */
    test("⭐RPCが返した件数をそのまま返す（hasMoreの根拠を壊さない）", async () => {
      const stub = createSupabaseStub({
        ranking: [rankingRow("p1", 1), rankingRow("p2", 2)],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const posts = await getPopularPrompts(2, 0, null);

      expect(posts).toHaveLength(2);
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

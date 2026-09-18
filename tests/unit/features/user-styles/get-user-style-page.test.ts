/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/posts/lib/server-api", () => ({ enrichPosts: jest.fn() }));

import {
  USER_STYLE_PAGE_MAX,
  USER_STYLE_PAGE_SIZE,
  getUserStylePage,
} from "@/features/user-styles/lib/get-user-style-page";
import { enrichPosts } from "@/features/posts/lib/server-api";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockEnrichPosts = enrichPosts as jest.MockedFunction<typeof enrichPosts>;

type PageRow = { post: { id: string; posted_at: string }; usage_count: number };

function row(id: string, postedAt: string, usage = 0): PageRow {
  return { post: { id, posted_at: postedAt }, usage_count: usage };
}

/**
 * getUserStylePage が使う唯一の呼び出し（rpc）だけを備えたスタブ。
 *
 * ⭐ `from("generated_images")` は**あってはならない**。ID だけ受け取って
 *    別文で投稿本体を引くと、2文の間の投稿取消・モデレーション・ブロック・通報で
 *    除外が効かなくなる（ADR-002）。呼ばれたらテストを落とす。
 */
function createSupabaseStub(options: {
  rows?: PageRow[];
  error?: { code: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: options.rows ?? [],
    error: options.error ?? null,
  });
  const from = jest.fn((table: string) => {
    throw new Error(`投稿本体を別クエリで引いてはいけない: from(${table})`);
  });
  return { rpc, from } as unknown as ReturnType<typeof createAdminClient> & {
    rpc: jest.Mock;
    from: jest.Mock;
  };
}

describe("getUserStylePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 既定では RPC が返した行をそのまま投稿として返す（順序の検証用）。
    mockEnrichPosts.mockImplementation(
      async (posts) => posts as unknown as Awaited<ReturnType<typeof enrichPosts>>
    );
  });

  test("RPC を1回だけ呼び、投稿本体を別クエリで引かない", async () => {
    const stub = createSupabaseStub({ rows: [row("a", "2026-09-18T00:00:00Z")] });
    mockCreateAdminClient.mockReturnValue(stub);

    await getUserStylePage();

    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.from).not.toHaveBeenCalled();
  });

  test("RPC に渡す引数（cursor は postedAt と id に分解する）", async () => {
    const stub = createSupabaseStub({ rows: [] });
    mockCreateAdminClient.mockReturnValue(stub);

    await getUserStylePage({
      limit: 5,
      sort: "usage",
      authorId: "author-1",
      cursor: { postedAt: "2026-09-01T00:00:00Z", id: "cursor-1" },
      currentUserId: "viewer-1",
    });

    expect(stub.rpc).toHaveBeenCalledWith("get_user_style_page", {
      p_viewer_id: "viewer-1",
      p_limit: 5,
      p_sort: "usage",
      p_author_id: "author-1",
      p_cursor_posted_at: "2026-09-01T00:00:00Z",
      p_cursor_id: "cursor-1",
    });
  });

  test("既定は新着順・20件・未ログイン扱い", async () => {
    const stub = createSupabaseStub({ rows: [] });
    mockCreateAdminClient.mockReturnValue(stub);

    await getUserStylePage();

    expect(stub.rpc).toHaveBeenCalledWith(
      "get_user_style_page",
      expect.objectContaining({
        p_sort: "newest",
        p_limit: USER_STYLE_PAGE_SIZE,
        p_viewer_id: null,
        p_author_id: null,
        p_cursor_posted_at: null,
        p_cursor_id: null,
      })
    );
  });

  test("RPC が並べた順序のまま返す（並べ替え直さない）", async () => {
    const stub = createSupabaseStub({
      rows: [
        row("b", "2026-09-18T00:00:00Z"),
        row("a", "2026-09-17T00:00:00Z"),
        row("c", "2026-09-16T00:00:00Z"),
      ],
    });
    mockCreateAdminClient.mockReturnValue(stub);

    const { posts } = await getUserStylePage({ limit: 3 });

    expect(posts.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  /*
    ⭐ 上限は RPC 側の p_limit 制約（1..40）と同じ値でなければならない。
    片方だけ緩めると、route を通った値が RPC で例外になって 500 になる。
  */
  test("1ページ上限は RPC の制約と同じ 40", () => {
    expect(USER_STYLE_PAGE_MAX).toBe(40);
  });

  describe("nextCursor", () => {
    test("limit ちょうど返ったら最後の行から作る", async () => {
      const stub = createSupabaseStub({
        rows: [row("a", "2026-09-18T00:00:00Z"), row("b", "2026-09-17T00:00:00Z")],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const { nextCursor } = await getUserStylePage({ limit: 2 });

      expect(nextCursor).toEqual({ postedAt: "2026-09-17T00:00:00Z", id: "b" });
    });

    test("limit に満たなければ null（最後のページ）", async () => {
      const stub = createSupabaseStub({ rows: [row("a", "2026-09-18T00:00:00Z")] });
      mockCreateAdminClient.mockReturnValue(stub);

      const { nextCursor } = await getUserStylePage({ limit: 2 });

      expect(nextCursor).toBeNull();
    });

    /*
      ⭐ usage は1ページで返し切る設計。利用回数はライブに動くので、
      cursor を出してしまうとページ境界で重複・欠落が起きる。
    */
    test("usage 並びは limit ちょうどでも null", async () => {
      const stub = createSupabaseStub({
        rows: [row("a", "2026-09-18T00:00:00Z", 5), row("b", "2026-09-17T00:00:00Z", 3)],
      });
      mockCreateAdminClient.mockReturnValue(stub);

      const { nextCursor } = await getUserStylePage({ limit: 2, sort: "usage" });

      expect(nextCursor).toBeNull();
    });

    /*
      ⭐ cursor は **RPC の生の行**から作ること。enrichPosts の結果から作ると、
      enrich が付け足す・並べ替える処理を挟んだ瞬間に「境界がずれない」という
      保証の根拠が消える。enrich が別物を返しても cursor は生の行に従う。
    */
    test("enrichPosts の結果ではなく RPC の生の行から作る", async () => {
      const stub = createSupabaseStub({
        rows: [row("a", "2026-09-18T00:00:00Z"), row("b", "2026-09-17T00:00:00Z")],
      });
      mockCreateAdminClient.mockReturnValue(stub);
      mockEnrichPosts.mockResolvedValue([
        { id: "zzz", posted_at: "1999-01-01T00:00:00Z" },
      ] as unknown as Awaited<ReturnType<typeof enrichPosts>>);

      const { nextCursor } = await getUserStylePage({ limit: 2 });

      expect(nextCursor).toEqual({ postedAt: "2026-09-17T00:00:00Z", id: "b" });
    });
  });

  describe("fail closed", () => {
    test("RPC エラーなら空。新着順へフォールバックしない", async () => {
      const stub = createSupabaseStub({ rows: [], error: { code: "42883" } });
      mockCreateAdminClient.mockReturnValue(stub);
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await getUserStylePage();

      expect(result).toEqual({ posts: [], nextCursor: null });
      expect(mockEnrichPosts).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test("0件なら enrich を呼ばずに空を返す", async () => {
      const stub = createSupabaseStub({ rows: [] });
      mockCreateAdminClient.mockReturnValue(stub);

      const result = await getUserStylePage();

      expect(result).toEqual({ posts: [], nextCursor: null });
      expect(mockEnrichPosts).not.toHaveBeenCalled();
    });
  });
});

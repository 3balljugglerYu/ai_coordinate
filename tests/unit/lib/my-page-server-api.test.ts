/** @jest-environment node */

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    cache: <T,>(fn: T) => fn,
  };
});

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  PERCOIN_TRANSACTIONS_PER_PAGE,
  getFreePercoinBatchesExpiringServer,
  getImageDetailServer,
  getMyImagesServer,
  getPercoinBalanceBreakdownServer,
  getPercoinBalanceServer,
  getPercoinTransactionsServer,
  getUserPostsServer,
  getUserProfileServer,
  getUserStatsServer,
} from "@/features/my-page/lib/server-api";

type QueryResult<T = unknown> = {
  data: T | null;
  error: unknown | null;
  count?: number | null;
};

type QueryConfig = {
  result?: QueryResult;
  singleResult?: QueryResult;
  rangeResult?: QueryResult;
  awaitReject?: unknown;
  singleReject?: unknown;
  rangeReject?: unknown;
};

type QueryCalls = {
  select: unknown[][];
  eq: unknown[][];
  in: unknown[][];
  order: unknown[][];
  range: unknown[][];
  single: number;
};

type QueryControl = {
  builder: {
    select: jest.Mock;
    eq: jest.Mock;
    in: jest.Mock;
    order: jest.Mock;
    range: jest.Mock;
    single: jest.Mock;
    then: Promise<QueryResult>["then"];
  };
  calls: QueryCalls;
};

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function resolveResult(result?: QueryResult): QueryResult {
  return {
    data: result?.data ?? null,
    error: result?.error ?? null,
    count: result?.count ?? null,
  };
}

function createAsyncQuery(config: QueryConfig = {}): QueryControl {
  const calls: QueryCalls = {
    select: [],
    eq: [],
    in: [],
    order: [],
    range: [],
    single: 0,
  };

  const builder = {
    select: jest.fn((...args: unknown[]) => {
      calls.select.push(args);
      return builder;
    }),
    eq: jest.fn((...args: unknown[]) => {
      calls.eq.push(args);
      return builder;
    }),
    in: jest.fn((...args: unknown[]) => {
      calls.in.push(args);
      return builder;
    }),
    order: jest.fn((...args: unknown[]) => {
      calls.order.push(args);
      return builder;
    }),
    range: jest.fn((...args: unknown[]) => {
      calls.range.push(args);
      if ("rangeReject" in config) {
        return Promise.reject(config.rangeReject);
      }
      return Promise.resolve(resolveResult(config.rangeResult ?? config.result));
    }),
    single: jest.fn(() => {
      calls.single += 1;
      if ("singleReject" in config) {
        return Promise.reject(config.singleReject);
      }
      return Promise.resolve(resolveResult(config.singleResult ?? config.result));
    }),
    then: (
      onFulfilled?: ((value: QueryResult) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null
    ) => {
      if ("awaitReject" in config) {
        return Promise.reject(config.awaitReject).then(onFulfilled, onRejected);
      }
      return Promise.resolve(resolveResult(config.result)).then(
        onFulfilled,
        onRejected
      );
    },
  };

  return { builder, calls };
}

function createSupabaseMock(options: {
  authUser?: { id: string; email?: string } | null;
  from?: Record<string, QueryConfig[]>;
  rpc?: Record<string, QueryConfig[]>;
} = {}) {
  const fromQueues = new Map(
    Object.entries(options.from ?? {}).map(([table, configs]) => [table, [...configs]])
  );
  const rpcQueues = new Map(
    Object.entries(options.rpc ?? {}).map(([name, configs]) => [name, [...configs]])
  );

  const fromCalls: Record<string, QueryControl[]> = {};
  const rpcCalls: Array<{
    name: string;
    params: Record<string, unknown>;
    control: QueryControl;
  }> = [];

  const from = jest.fn((table: string) => {
    const queue = fromQueues.get(table);
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected from(${table}) call`);
    }

    const control = createAsyncQuery(queue.shift());
    fromCalls[table] = [...(fromCalls[table] ?? []), control];
    return control.builder;
  });

  const rpc = jest.fn((name: string, params: Record<string, unknown>) => {
    const queue = rpcQueues.get(name);
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected rpc(${name}) call`);
    }

    const control = createAsyncQuery(queue.shift());
    rpcCalls.push({ name, params, control });
    return control.builder;
  });

  const getUser = jest.fn().mockResolvedValue({
    data: { user: options.authUser ?? null },
    error: null,
  });

  return {
    client: {
      from,
      rpc,
      auth: { getUser },
    },
    from,
    rpc,
    getUser,
    fromCalls,
    rpcCalls,
  };
}

function createImageRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "image-1",
    user_id: "user-1",
    prompt: "prompt",
    image_url: "https://example.com/image.webp",
    is_posted: true,
    created_at: "2026-03-01T00:00:00.000Z",
    posted_at: "2026-03-02T00:00:00.000Z",
    view_count: 0,
    ...overrides,
  };
}

describe("MyPageServerApi unit tests from EARS specs", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreateClient.mockReset();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("MPSAPI-001 getUserProfileServer", () => {
    test("getUserProfileServer_overrideなしで自分のプロフィールの場合_email付きで返す", async () => {
      // Spec: MPSAPI-001
      const supabase = createSupabaseMock({
        authUser: { id: "user-1", email: "own@example.com" },
        from: {
          profiles: [
            {
              singleResult: {
                data: {
                  id: "profile-1",
                  nickname: "Taro",
                  bio: "bio",
                  avatar_url: "/avatar.png",
                },
                error: null,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserProfileServer("user-1");

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(supabase.fromCalls.profiles[0].calls.select).toEqual([
        ["id, nickname, bio, avatar_url"],
      ]);
      expect(supabase.fromCalls.profiles[0].calls.eq).toEqual([["user_id", "user-1"]]);
      expect(supabase.fromCalls.profiles[0].calls.single).toBe(1);
      expect(supabase.getUser).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "profile-1",
        nickname: "Taro",
        bio: "bio",
        avatar_url: "/avatar.png",
        email: "own@example.com",
      });
    });

    test("getUserProfileServer_overrideなしで他人のプロフィールの場合_emailを含めない", async () => {
      // Spec: MPSAPI-001
      const differentUserSupabase = createSupabaseMock({
        authUser: { id: "user-2", email: "other@example.com" },
        from: {
          profiles: [
            {
              singleResult: {
                data: {
                  id: "profile-2",
                  nickname: null,
                  bio: null,
                  avatar_url: null,
                },
                error: null,
              },
            },
          ],
        },
      });
      const unauthenticatedSupabase = createSupabaseMock({
        authUser: null,
        from: {
          profiles: [
            {
              singleResult: {
                data: {
                  id: "profile-3",
                  nickname: "Guest",
                  bio: null,
                  avatar_url: null,
                },
                error: null,
              },
            },
          ],
        },
      });
      mockCreateClient
        .mockResolvedValueOnce(differentUserSupabase.client as never)
        .mockResolvedValueOnce(unauthenticatedSupabase.client as never);

      const differentUserResult = await getUserProfileServer("user-1");
      // Fixed: Also cover the spec edge case where auth.getUser resolves without a user.
      // Reason: MPSAPI-001 requires profile data to be returned and email to stay undefined.
      const unauthenticatedResult = await getUserProfileServer("user-3");

      expect(differentUserResult).toEqual({
        id: "profile-2",
        nickname: null,
        bio: null,
        avatar_url: null,
        email: undefined,
      });
      expect(unauthenticatedResult).toEqual({
        id: "profile-3",
        nickname: "Guest",
        bio: null,
        avatar_url: null,
        email: undefined,
      });
      expect(differentUserSupabase.getUser).toHaveBeenCalledTimes(1);
      expect(unauthenticatedSupabase.getUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("MPSAPI-002 getUserProfileServer", () => {
    test("getUserProfileServer_supabaseOverride指定時_overrideを使いemailを省略する", async () => {
      // Spec: MPSAPI-002
      const supabase = createSupabaseMock({
        from: {
          profiles: [
            {
              singleResult: {
                data: {
                  id: "profile-3",
                  nickname: "Hanako",
                  bio: null,
                  avatar_url: "/avatar-2.png",
                },
                error: null,
              },
            },
          ],
        },
      });

      const result = await getUserProfileServer("user-3", supabase.client as never);

      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(supabase.getUser).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: "profile-3",
        nickname: "Hanako",
        bio: null,
        avatar_url: "/avatar-2.png",
      });
    });
  });

  describe("MPSAPI-003 getUserProfileServer", () => {
    test("getUserProfileServer_プロフィール取得エラーの場合_null項目のフォールバックを返す", async () => {
      // Spec: MPSAPI-003
      const profileError = { message: "profile failed" };
      const supabase = createSupabaseMock({
        from: {
          profiles: [
            {
              singleResult: {
                data: null,
                error: profileError,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserProfileServer("user-4");

      expect(result).toEqual({
        id: "user-4",
        nickname: null,
        bio: null,
        avatar_url: null,
      });
      expect(supabase.getUser).not.toHaveBeenCalled();
    });

    test("getUserProfileServer_プロフィール行なしの場合_null項目のフォールバックを返す", async () => {
      // Spec: MPSAPI-003
      const supabase = createSupabaseMock({
        from: {
          profiles: [
            {
              singleResult: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserProfileServer("user-5");

      expect(result).toEqual({
        id: "user-5",
        nickname: null,
        bio: null,
        avatar_url: null,
      });
      expect(supabase.getUser).not.toHaveBeenCalled();
    });
  });

  describe("MPSAPI-004 getUserStatsServer", () => {
    test("getUserStatsServer_authで自分のプロフィールの場合_全カウンタを集計してgeneratedCountを公開する", async () => {
      // Spec: MPSAPI-004
      const supabase = createSupabaseMock({
        authUser: { id: "user-1" },
        from: {
          generated_images: [
            { result: { data: null, error: null, count: 4 } },
            { result: { data: null, error: null, count: 9 } },
            {
              result: {
                data: [{ id: "img-1" }, { id: "img-2" }],
                error: null,
              },
            },
            {
              result: {
                data: [{ view_count: 3 }, { view_count: null }, { view_count: 7 }],
                error: null,
              },
            },
          ],
          likes: [{ result: { data: null, error: null, count: 6 } }],
        },
        rpc: {
          get_follow_counts: [
            {
              singleResult: {
                data: { following_count: 5, follower_count: 8 },
                error: null,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserStatsServer("user-1");

      expect(result).toEqual({
        generatedCount: 9,
        generatedCountPublic: true,
        postedCount: 4,
        likeCount: 6,
        viewCount: 10,
        followerCount: 8,
        followingCount: 5,
      });
      expect(supabase.getUser).toHaveBeenCalledTimes(1);
      expect(supabase.fromCalls.generated_images).toHaveLength(4);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["user_id", "user-1"],
        ["is_posted", true],
      ]);
      expect(supabase.fromCalls.generated_images[1].calls.eq).toEqual([
        ["user_id", "user-1"],
      ]);
      expect(supabase.fromCalls.likes[0].calls.in).toEqual([
        ["image_id", ["img-1", "img-2"]],
      ]);
      expect(supabase.rpcCalls[0]).toMatchObject({
        name: "get_follow_counts",
        params: { p_user_id: "user-1" },
      });
    });

    test("getUserStatsServer_supabaseOverrideで自分のプロフィールの場合_auth参照なしで集計する", async () => {
      // Spec: MPSAPI-004
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            { result: { data: null, error: null, count: 2 } },
            { result: { data: null, error: null, count: 5 } },
            {
              result: {
                data: [{ id: "img-10" }],
                error: null,
              },
            },
            {
              result: {
                data: [{ view_count: 4 }],
                error: null,
              },
            },
          ],
          likes: [{ result: { data: null, error: null, count: 3 } }],
        },
        rpc: {
          get_follow_counts: [
            {
              singleResult: {
                data: { following_count: 2, follower_count: 1 },
                error: null,
              },
            },
          ],
        },
      });

      const result = await getUserStatsServer("user-9", supabase.client as never, {
        isOwnProfile: true,
      });

      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(supabase.getUser).not.toHaveBeenCalled();
      expect(result.generatedCount).toBe(5);
      expect(result.generatedCountPublic).toBe(true);
      expect(result.likeCount).toBe(3);
      expect(result.viewCount).toBe(4);
    });
  });

  describe("MPSAPI-005 getUserStatsServer", () => {
    test("getUserStatsServer_他人のプロフィールの場合_generatedCountを隠しつつ公開集計を返す", async () => {
      // Spec: MPSAPI-005
      const supabase = createSupabaseMock({
        authUser: { id: "viewer-1" },
        from: {
          generated_images: [
            { result: { data: null, error: null, count: 2 } },
            {
              result: {
                data: [{ id: "img-20" }, { id: "img-21" }],
                error: null,
              },
            },
            {
              result: {
                data: [{ view_count: 1 }, { view_count: 3 }],
                error: null,
              },
            },
          ],
          likes: [{ result: { data: null, error: null, count: 4 } }],
        },
        rpc: {
          get_follow_counts: [
            {
              singleResult: {
                data: { following_count: 9, follower_count: 7 },
                error: null,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserStatsServer("user-2");

      expect(result).toEqual({
        generatedCount: 0,
        generatedCountPublic: false,
        postedCount: 2,
        likeCount: 4,
        viewCount: 4,
        followerCount: 7,
        followingCount: 9,
      });
      expect(supabase.fromCalls.generated_images).toHaveLength(3);
      expect(supabase.fromCalls.likes).toHaveLength(1);
    });

    test("getUserStatsServer_他人のプロフィールで投稿済み画像なしの場合_likeCountを0に保つ", async () => {
      // Spec: MPSAPI-005
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            { result: { data: null, error: null, count: 0 } },
            {
              result: {
                data: [],
                error: null,
              },
            },
            {
              result: {
                data: [],
                error: null,
              },
            },
          ],
        },
        rpc: {
          get_follow_counts: [
            {
              singleResult: {
                data: { following_count: null, follower_count: undefined },
                error: null,
              },
            },
          ],
        },
      });

      const result = await getUserStatsServer("user-3", supabase.client as never);

      expect(result.generatedCount).toBe(0);
      expect(result.generatedCountPublic).toBe(false);
      expect(result.likeCount).toBe(0);
      expect(result.followerCount).toBe(0);
      expect(result.followingCount).toBe(0);
      expect(supabase.fromCalls.likes).toBeUndefined();
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(supabase.getUser).not.toHaveBeenCalled();
    });
  });

  describe("MPSAPI-006 getUserStatsServer", () => {
    test("getUserStatsServer_followCountRpcエラーの場合_ログしてfollow数を0にフォールバックする", async () => {
      // Spec: MPSAPI-006
      const followError = { message: "rpc failed" };
      const supabase = createSupabaseMock({
        authUser: { id: "user-1" },
        from: {
          generated_images: [
            { result: { data: null, error: null, count: 1 } },
            { result: { data: null, error: null, count: 2 } },
            {
              result: {
                data: [{ id: "img-30" }],
                error: null,
              },
            },
            {
              result: {
                data: [{ view_count: 11 }],
                error: null,
              },
            },
          ],
          likes: [{ result: { data: null, error: null, count: 5 } }],
        },
        rpc: {
          get_follow_counts: [
            {
              singleResult: {
                // Fixed: keep partial follow count data in the payload so the test
                // proves the helper prefers the error path over returned counters.
                data: { following_count: 99, follower_count: 77 },
                error: followError,
              },
            },
          ],
        },
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getUserStatsServer("user-1");

      expect(result.postedCount).toBe(1);
      expect(result.generatedCount).toBe(2);
      expect(result.likeCount).toBe(5);
      expect(result.viewCount).toBe(11);
      expect(result.followerCount).toBe(0);
      expect(result.followingCount).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Follow counts fetch error:",
        followError
      );
    });
  });

  describe("MPSAPI-007 getUserPostsServer", () => {
    test("getUserPostsServer_limitとoffset指定時_postedAt降順の投稿済み行を返す", async () => {
      // Spec: MPSAPI-007
      const rows = [
        createImageRecord({ id: "post-1", posted_at: "2026-03-03T00:00:00.000Z" }),
        createImageRecord({ id: "post-2", posted_at: "2026-03-02T00:00:00.000Z" }),
      ];
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: rows,
                error: null,
              },
            },
          ],
        },
      });

      const result = await getUserPostsServer("user-1", 3, 5, supabase.client as never);

      expect(result).toEqual(rows);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["user_id", "user-1"],
        ["is_posted", true],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.order).toEqual([
        ["posted_at", { ascending: false }],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.range).toEqual([[5, 7]]);
    });

    test("getUserPostsServer_dataがnull相当の場合_空配列を返す", async () => {
      // Spec: MPSAPI-007
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });

      const result = await getUserPostsServer("user-1", undefined, undefined, supabase.client as never);

      expect(result).toEqual([]);
      expect(supabase.fromCalls.generated_images[0].calls.range).toEqual([[0, 19]]);
    });
  });

  describe("MPSAPI-008 getUserPostsServer", () => {
    test("getUserPostsServer_クエリエラーの場合_ログして空配列を返す", async () => {
      // Spec: MPSAPI-008
      const postsError = { message: "posts failed" };
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: [createImageRecord({ id: "stale-row" })],
                error: postsError,
              },
            },
          ],
        },
      });

      const result = await getUserPostsServer("user-2", 2, 0, supabase.client as never);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith("User posts fetch error:", postsError);
    });
  });

  describe("MPSAPI-009 getMyImagesServer", () => {
    test("getMyImagesServer_all指定時_isPosted条件なしでcreatedAt降順にする", async () => {
      // Spec: MPSAPI-009
      const rows = [createImageRecord({ id: "all-1" })];
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: rows,
                error: null,
              },
            },
          ],
        },
      });

      const result = await getMyImagesServer(
        "user-1",
        "all",
        10,
        20,
        supabase.client as never
      );

      expect(result).toEqual(rows);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["user_id", "user-1"],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.order).toEqual([
        ["created_at", { ascending: false }],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.range).toEqual([[20, 29]]);
    });

    test("getMyImagesServer_posted指定時_投稿済みのみでpostedAt降順にする", async () => {
      // Spec: MPSAPI-009
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: [],
                error: null,
              },
            },
          ],
        },
      });

      const result = await getMyImagesServer(
        "user-2",
        "posted",
        5,
        0,
        supabase.client as never
      );

      expect(result).toEqual([]);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["user_id", "user-2"],
        ["is_posted", true],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.order).toEqual([
        ["posted_at", { ascending: false }],
      ]);
    });

    test("getMyImagesServer_unposted指定時_未投稿のみでcreatedAt降順にする", async () => {
      // Spec: MPSAPI-009
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });

      const result = await getMyImagesServer(
        "user-3",
        "unposted",
        50,
        0,
        supabase.client as never
      );

      expect(result).toEqual([]);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["user_id", "user-3"],
        ["is_posted", false],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.order).toEqual([
        ["created_at", { ascending: false }],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.range).toEqual([[0, 49]]);
    });
  });

  describe("MPSAPI-010 getMyImagesServer", () => {
    test("getMyImagesServer_クエリエラーの場合_診断ログを出してローカライズ済みエラーを投げる", async () => {
      // Spec: MPSAPI-010
      const queryError = {
        message: "db failed",
        code: "42P01",
        hint: "check generated_images",
      };
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeResult: {
                data: null,
                error: queryError,
              },
            },
          ],
        },
      });

      await expect(
        getMyImagesServer("user-10", "posted", 5, 0, supabase.client as never)
      ).rejects.toThrow("画像の取得に失敗しました: db failed");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[getMyImagesServer] Database query error:",
        queryError
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[getMyImagesServer] User ID:",
        "user-10"
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[getMyImagesServer] Filter:",
        "posted"
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[getMyImagesServer] Unexpected error:",
        expect.any(Error)
      );
    });

    test("getMyImagesServer_Error以外がthrowされた場合_UnknownErrorに正規化する", async () => {
      // Spec: MPSAPI-010
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              rangeReject: "boom",
            },
          ],
        },
      });

      await expect(
        getMyImagesServer("user-11", "all", 50, 0, supabase.client as never)
      ).rejects.toThrow("画像の取得に失敗しました: Unknown error");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[getMyImagesServer] Unexpected error:",
        "boom"
      );
    });
  });

  describe("MPSAPI-011 getImageDetailServer", () => {
    test("getImageDetailServer_userとimageIdが一致する場合_画像レコードを返す", async () => {
      // Spec: MPSAPI-011
      const row = createImageRecord({ id: "image-99", user_id: "user-9" });
      const supabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              singleResult: {
                data: row,
                error: null,
              },
            },
          ],
        },
      });

      const result = await getImageDetailServer(
        "user-9",
        "image-99",
        supabase.client as never
      );

      expect(result).toEqual(row);
      expect(supabase.fromCalls.generated_images[0].calls.eq).toEqual([
        ["id", "image-99"],
        ["user_id", "user-9"],
      ]);
      expect(supabase.fromCalls.generated_images[0].calls.single).toBe(1);
    });

    test("getImageDetailServer_行なしまたはエラーの場合_nullを返す", async () => {
      // Spec: MPSAPI-011
      const missingSupabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              singleResult: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });
      const errorSupabase = createSupabaseMock({
        from: {
          generated_images: [
            {
              singleResult: {
                data: null,
                error: { message: "not found" },
              },
            },
          ],
        },
      });

      await expect(
        getImageDetailServer("user-1", "image-1", missingSupabase.client as never)
      ).resolves.toBeNull();
      await expect(
        getImageDetailServer("user-1", "image-1", errorSupabase.client as never)
      ).resolves.toBeNull();
    });
  });

  describe("MPSAPI-012 getPercoinBalanceServer", () => {
    test("getPercoinBalanceServer_残高行がある場合_残高またはnull相当なら0を返す", async () => {
      // Spec: MPSAPI-012
      const balanceSupabase = createSupabaseMock({
        from: {
          user_credits: [
            {
              singleResult: {
                data: { balance: 250 },
                error: null,
              },
            },
          ],
        },
      });
      const nullishSupabase = createSupabaseMock({
        from: {
          user_credits: [
            {
              singleResult: {
                data: { balance: null },
                error: null,
              },
            },
          ],
        },
      });

      await expect(
        getPercoinBalanceServer("user-1", balanceSupabase.client as never)
      ).resolves.toBe(250);
      await expect(
        getPercoinBalanceServer("user-1", nullishSupabase.client as never)
      ).resolves.toBe(0);
      expect(balanceSupabase.fromCalls.user_credits[0].calls.eq).toEqual([
        ["user_id", "user-1"],
      ]);
    });

    test("getPercoinBalanceServer_クエリエラーの場合_ログして0を返す", async () => {
      // Spec: MPSAPI-012
      const balanceError = { message: "balance failed" };
      const supabase = createSupabaseMock({
        from: {
          user_credits: [
            {
              singleResult: {
                data: null,
                error: balanceError,
              },
            },
          ],
        },
      });

      const result = await getPercoinBalanceServer("user-2", supabase.client as never);

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Database query error:",
        balanceError
      );
    });
  });

  describe("MPSAPI-013 getPercoinTransactionsServer", () => {
    test("getPercoinTransactionsServer_明示パラメータ指定時_RPCを呼び正規化済み取引へ変換する", async () => {
      // Spec: MPSAPI-013
      const supabase = createSupabaseMock({
        rpc: {
          get_percoin_transactions_with_expiry: [
            {
              result: {
                data: [
                  {
                    id: 123,
                    amount: "25",
                    transaction_type: "purchase",
                    metadata: { campaign: "spring" },
                    created_at: 999,
                    expire_at: null,
                  },
                  {
                    id: "tx-2",
                    amount: 3,
                    transaction_type: 7,
                    created_at: "2026-03-03T00:00:00.000Z",
                    expire_at: 1710000000,
                  },
                ],
                error: null,
              },
            },
          ],
        },
      });

      const result = await getPercoinTransactionsServer(
        "user-1",
        5,
        supabase.client as never,
        "usage",
        10
      );

      expect(supabase.rpcCalls[0]).toMatchObject({
        name: "get_percoin_transactions_with_expiry",
        params: {
          p_user_id: "user-1",
          p_filter: "usage",
          p_sort: "created_at",
          p_limit: 5,
          p_offset: 10,
        },
      });
      expect(result).toEqual([
        {
          id: "123",
          amount: 25,
          transaction_type: "purchase",
          metadata: { campaign: "spring" },
          created_at: "999",
          expire_at: null,
        },
        {
          id: "tx-2",
          amount: 3,
          transaction_type: "7",
          metadata: null,
          created_at: "2026-03-03T00:00:00.000Z",
          expire_at: "1710000000",
        },
      ]);
    });

    test("getPercoinTransactionsServer_RPCエラーまたはlimit省略時_空配列を返し既定limitを使う", async () => {
      // Spec: MPSAPI-013
      const error = { message: "transactions failed" };
      const errorSupabase = createSupabaseMock({
        rpc: {
          get_percoin_transactions_with_expiry: [
            {
              result: {
                data: null,
                error,
              },
            },
          ],
        },
      });
      const defaultLimitSupabase = createSupabaseMock({
        rpc: {
          get_percoin_transactions_with_expiry: [
            {
              result: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });

      await expect(
        getPercoinTransactionsServer(
          "user-2",
          undefined,
          errorSupabase.client as never
        )
      ).resolves.toEqual([]);
      await expect(
        getPercoinTransactionsServer(
          "user-3",
          undefined,
          defaultLimitSupabase.client as never
        )
      ).resolves.toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Percoin transactions fetch error:",
        error
      );
      expect(defaultLimitSupabase.rpcCalls[0].params).toEqual({
        p_user_id: "user-3",
        p_filter: "all",
        p_sort: "created_at",
        p_limit: PERCOIN_TRANSACTIONS_PER_PAGE,
        p_offset: 0,
      });
    });
  });

  describe("MPSAPI-014 getPercoinBalanceBreakdownServer", () => {
    test("getPercoinBalanceBreakdownServer_内訳行がある場合_数値化した内訳を返す", async () => {
      // Spec: MPSAPI-014
      const supabase = createSupabaseMock({
        rpc: {
          get_percoin_balance_breakdown: [
            {
              singleResult: {
                data: {
                  total: "9",
                  regular: "4",
                  paid: 2,
                  unlimited_bonus: "1",
                  period_limited: null,
                },
                error: null,
              },
            },
          ],
        },
      });

      const result = await getPercoinBalanceBreakdownServer(
        "user-1",
        supabase.client as never
      );

      expect(supabase.rpcCalls[0]).toMatchObject({
        name: "get_percoin_balance_breakdown",
        params: { p_user_id: "user-1" },
      });
      expect(result).toEqual({
        total: 9,
        regular: 4,
        paid: 2,
        unlimited_bonus: 1,
        period_limited: 0,
      });
    });

    test("getPercoinBalanceBreakdownServer_RPCエラーまたはdataなしの場合_ログしてゼロ内訳を返す", async () => {
      // Spec: MPSAPI-014
      const rpcError = { message: "breakdown failed" };
      const errorSupabase = createSupabaseMock({
        rpc: {
          get_percoin_balance_breakdown: [
            {
              singleResult: {
                data: null,
                error: rpcError,
              },
            },
          ],
        },
      });
      const noDataSupabase = createSupabaseMock({
        rpc: {
          get_percoin_balance_breakdown: [
            {
              singleResult: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });

      const expectedZero = {
        total: 0,
        regular: 0,
        paid: 0,
        unlimited_bonus: 0,
        period_limited: 0,
      };

      await expect(
        getPercoinBalanceBreakdownServer("user-2", errorSupabase.client as never)
      ).resolves.toEqual(expectedZero);
      await expect(
        getPercoinBalanceBreakdownServer("user-3", noDataSupabase.client as never)
      ).resolves.toEqual(expectedZero);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "get_percoin_balance_breakdown error:",
        rpcError
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "get_percoin_balance_breakdown error:",
        null
      );
    });
  });

  describe("MPSAPI-015 getFreePercoinBatchesExpiringServer", () => {
    test("getFreePercoinBatchesExpiringServer_RPC行がある場合_正規化済みバッチへ変換する", async () => {
      // Spec: MPSAPI-015
      const supabase = createSupabaseMock({
        rpc: {
          get_free_percoin_batches_expiring: [
            {
              result: {
                data: [
                  {
                    id: 1,
                    user_id: 2,
                    remaining_amount: "12",
                    expire_at: 1711111111,
                    source: 99,
                  },
                ],
                error: null,
              },
            },
          ],
        },
      });

      const result = await getFreePercoinBatchesExpiringServer(
        "user-1",
        supabase.client as never
      );

      expect(supabase.rpcCalls[0]).toMatchObject({
        name: "get_free_percoin_batches_expiring",
        params: { p_user_id: "user-1" },
      });
      expect(result).toEqual([
        {
          id: "1",
          user_id: "2",
          remaining_amount: 12,
          expire_at: "1711111111",
          source: "99",
        },
      ]);
    });

    test("getFreePercoinBatchesExpiringServer_RPCエラーの場合_ログして空配列を返す", async () => {
      // Spec: MPSAPI-015
      const rpcError = { message: "batch failed" };
      const errorSupabase = createSupabaseMock({
        rpc: {
          get_free_percoin_batches_expiring: [
            {
              result: {
                data: null,
                error: rpcError,
              },
            },
          ],
        },
      });
      const nullishSupabase = createSupabaseMock({
        rpc: {
          get_free_percoin_batches_expiring: [
            {
              result: {
                data: null,
                error: null,
              },
            },
          ],
        },
      });

      await expect(
        getFreePercoinBatchesExpiringServer("user-2", errorSupabase.client as never)
      ).resolves.toEqual([]);
      await expect(
        getFreePercoinBatchesExpiringServer("user-3", nullishSupabase.client as never)
      ).resolves.toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "get_free_percoin_batches_expiring error:",
        rpcError
      );
    });
  });
});

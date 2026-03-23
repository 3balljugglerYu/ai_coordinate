/** @jest-environment node */

jest.mock("@/features/posts/lib/server-api", () => ({
  getPosts: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/route";
import { getPosts } from "@/features/posts/lib/server-api";

const mockGetPosts = getPosts as jest.MockedFunction<typeof getPosts>;

function createRequest(url: string): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": "ja" },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function createRequestEn(url: string): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": "en" },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

describe("GET /api/posts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPosts.mockResolvedValue([]);
  });

  test("GET_limit0の場合_400でinvalidLimit", async () => {
    // Spec: POSTSGET-001
    const res = await GET(createRequest("http://localhost/api/posts?limit=0"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_INVALID_LIMIT");
    expect(body.error).toBe("limit は 1 以上 100 以下で指定してください");
    expect(mockGetPosts).not.toHaveBeenCalled();
  });

  test("GET_limit101の場合_400でinvalidLimit", async () => {
    // Spec: POSTSGET-001
    const res = await GET(createRequest("http://localhost/api/posts?limit=101"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_INVALID_LIMIT");
    expect(mockGetPosts).not.toHaveBeenCalled();
  });

  test("GET_offset負の場合_400でinvalidOffset", async () => {
    // Spec: POSTSGET-002
    const res = await GET(createRequest("http://localhost/api/posts?offset=-1"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_INVALID_OFFSET");
    expect(body.error).toBe("offset は 0 以上で指定してください");
    expect(mockGetPosts).not.toHaveBeenCalled();
  });

  test("GET_無効なsortの場合_getPostsにnewestで呼ぶ", async () => {
    // Spec: POSTSGET-003
    mockGetPosts.mockResolvedValue([]);

    await GET(createRequest("http://localhost/api/posts?sort=not-a-real-sort"));

    expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined);
  });

  test("GET_sortPopularの場合_getPostsにpopularで呼ぶ", async () => {
    // Spec: POSTSGET-004
    mockGetPosts.mockResolvedValue([]);

    await GET(createRequest("http://localhost/api/posts?sort=popular"));

    expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "popular", undefined);
  });

  test("GET_既定クエリの場合_getPostsに20_0_newest", async () => {
    // Spec: POSTSGET-005
    mockGetPosts.mockResolvedValue([]);

    const res = await GET(createRequest("http://localhost/api/posts"));
    const body = (await res.json()) as { posts: unknown[]; hasMore: boolean };

    expect(res.status).toBe(200);
    expect(body.posts).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined);
  });

  test("GET_qに前後空白の場合_トリムした検索語を渡す", async () => {
    // Spec: POSTSGET-005
    mockGetPosts.mockResolvedValue([]);

    await GET(createRequest("http://localhost/api/posts?q=%20%20foo%20%20"));

    expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", "foo");
  });

  test("GET_qが空の場合_undefinedを渡す", async () => {
    // Spec: POSTSGET-005
    mockGetPosts.mockResolvedValue([]);

    await GET(createRequest("http://localhost/api/posts?q=%20%20"));

    expect(mockGetPosts).toHaveBeenCalledWith(20, 0, "newest", undefined);
  });

  test("GET_件数がlimitと一致の場合_hasMore真", async () => {
    // Spec: POSTSGET-005
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}` }));
    mockGetPosts.mockResolvedValue(posts as never);

    const res = await GET(
      createRequest("http://localhost/api/posts?limit=10&offset=0"),
    );
    const body = (await res.json()) as { posts: unknown[]; hasMore: boolean };

    expect(res.status).toBe(200);
    expect(body.posts).toHaveLength(10);
    expect(body.hasMore).toBe(true);
  });

  test("GET_件数がlimit未満の場合_hasMore偽", async () => {
    // Spec: POSTSGET-005
    mockGetPosts.mockResolvedValue([{ id: "p-1" }] as never);

    const res = await GET(
      createRequest("http://localhost/api/posts?limit=10&offset=0"),
    );
    const body = (await res.json()) as { posts: unknown[]; hasMore: boolean };

    expect(res.status).toBe(200);
    expect(body.hasMore).toBe(false);
  });

  test("GET_getPosts例外の場合_500でfetch失敗", async () => {
    // Spec: POSTSGET-006
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetPosts.mockRejectedValue(new Error("db down"));

    try {
      const res = await GET(createRequest("http://localhost/api/posts"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.errorCode).toBe("POSTS_FETCH_FAILED");
      expect(body.error).toBe("投稿の取得に失敗しました");
    } finally {
      consoleError.mockRestore();
    }
  });

  test("GET_英語ロケールの場合_英語のinvalidLimit", async () => {
    // Spec: POSTSGET-007
    const res = await GET(
      createRequestEn("http://localhost/api/posts?limit=0"),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe("limit must be between 1 and 100.");
  });
});

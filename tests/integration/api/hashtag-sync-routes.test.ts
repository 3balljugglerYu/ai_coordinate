/** @jest-environment node */

import type { NextRequest } from "next/server";
import { POST as postRoute } from "@/app/api/posts/post/route";
import { PUT as updateRoute } from "@/app/api/posts/update/route";
import { POST as completionPostRoute } from "@/app/api/collections/completions/[id]/post/route";
import { getUser } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";
import { createClient } from "@/lib/supabase/server";
import { getRouteLocale } from "@/lib/api/route-locale";
import { isCollectionFeedPostEnabled } from "@/lib/env";
import { postCompletionToFeed } from "@/features/collections/lib/completion-feed-post";
import { syncPostHashtags } from "@/features/posts/lib/hashtag-sync";

jest.mock("next/cache");
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: jest.fn() };
});
jest.mock("@/lib/auth");
jest.mock("@/features/generation/lib/server-database");
jest.mock("@/features/generation/lib/webp-storage");
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/api/route-locale");
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isCollectionFeedPostEnabled: jest.fn(),
}));
jest.mock("@/features/collections/lib/completion-feed-post");
jest.mock("@/features/posts/lib/hashtag-sync");

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockPostImageServer = postImageServer as jest.MockedFunction<
  typeof postImageServer
>;
const mockEnsureWebPVariants = ensureWebPVariants as jest.MockedFunction<
  typeof ensureWebPVariants
>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;
const mockIsCollectionFeedPostEnabled =
  isCollectionFeedPostEnabled as jest.MockedFunction<
    typeof isCollectionFeedPostEnabled
  >;
const mockPostCompletionToFeed = postCompletionToFeed as jest.MockedFunction<
  typeof postCompletionToFeed
>;
const mockSyncPostHashtags = syncPostHashtags as jest.MockedFunction<
  typeof syncPostHashtags
>;

function createRequest(method: "POST" | "PUT", body?: unknown): NextRequest {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

/**
 * 投稿を作る経路は 3 つある。どれか 1 つでも同期を忘れると、その経路の投稿だけ
 * タグ検索に出てこない（表示は青くなるので気づきにくい）。ここで 3 つとも固定する。
 */
describe("ハッシュタグ同期の呼び出し経路", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockCreateClient.mockResolvedValue({
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    } as never);
    mockEnsureWebPVariants.mockResolvedValue({ status: "skipped" } as never);
    mockSyncPostHashtags.mockResolvedValue({ syncedCount: 1, skipped: false });
  });

  test("POST /api/posts/post_保存済みキャプションで同期する", async () => {
    mockPostImageServer.mockResolvedValue({
      id: "post-1",
      is_posted: true,
      // DB に入った値。リクエストのボディとは別物として扱う必要がある
      caption: "今日は #冬服",
    } as never);

    const response = await postRoute(
      createRequest("POST", { id: "post-1", caption: "今日は #冬服" })
    );

    expect(response.status).toBe(200);
    expect(mockSyncPostHashtags).toHaveBeenCalledWith("post-1", "今日は #冬服");
  });

  test("PUT /api/posts/update_編集でも洗い替える", async () => {
    mockPostImageServer.mockResolvedValue({
      id: "post-1",
      is_posted: true,
      caption: "#ニット に変えた",
      user_id: "user-1",
    } as never);

    const response = await updateRoute(
      createRequest("PUT", { id: "post-1", caption: "#ニット に変えた" })
    );

    expect(response.status).toBe(200);
    expect(mockSyncPostHashtags).toHaveBeenCalledWith(
      "post-1",
      "#ニット に変えた"
    );
  });

  test("POST /api/collections/completions/[id]/post_完走フィード投稿でも同期する", async () => {
    mockIsCollectionFeedPostEnabled.mockReturnValue(true);
    mockPostCompletionToFeed.mockResolvedValue({ postId: "post-2" });

    const response = await completionPostRoute(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: "完走した #イタリア旅行" }),
      }),
      { params: Promise.resolve({ id: "completion-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockSyncPostHashtags).toHaveBeenCalledWith(
      "post-2",
      "完走した #イタリア旅行"
    );
  });

  test("キャプションが空なら null で同期する（タグを消した状態に収束させる）", async () => {
    mockPostImageServer.mockResolvedValue({
      id: "post-1",
      is_posted: true,
      caption: null,
    } as never);

    await postRoute(createRequest("POST", { id: "post-1" }));

    expect(mockSyncPostHashtags).toHaveBeenCalledWith("post-1", null);
  });
});

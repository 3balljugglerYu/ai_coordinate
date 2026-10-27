/** @jest-environment node */

/**
 * GET /api/posts/[id]/source-reference のテスト。
 *
 * アプリの投稿詳細の参照カード用。Web の詳細と同じ getPost を通すので、
 * 見られない投稿では何も返さないこと・本文を返さないこと・閲覧者を渡すこと・
 * 共有キャッシュに置かないことを確かめる。
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/features/posts/lib/server-api", () => ({ getPost: jest.fn() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/source-reference/route";
import { getUser } from "@/lib/auth";
import { getPost } from "@/features/posts/lib/server-api";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockGetPost = getPost as jest.MockedFunction<typeof getPost>;

const POST_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";

const REFERENCE = {
  postId: POST_ID,
  isAvailable: true,
  authorId: "33333333-3333-4333-8333-333333333333",
  authorNickname: "原作者さん",
  authorAvatarUrl: null,
  thumbnailUrl: "https://cdn/thumb.webp",
  thumbnailWidth: 768,
  thumbnailHeight: 1376,
  beforeThumbnailUrl: "https://cdn/before.webp",
  promptVisibility: "public" as const,
  usageCount: 12,
};

function call(id = POST_ID) {
  return GET(new NextRequest(`https://www.persta.ai/api/posts/${id}/source-reference`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue(null);
});

it("returns the detail's source reference without the prompt, and never caches it", async () => {
  mockGetPost.mockResolvedValue({
    id: POST_ID,
    prompt: "白いワンピースにして",
    source_reference: REFERENCE,
  } as never);
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body).toEqual({ reference: REFERENCE });
  expect(JSON.stringify(body)).not.toContain("白いワンピース");
});

it("passes the viewer to getPost (own drafts, blocks) and skips the view count", async () => {
  mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
  mockGetPost.mockResolvedValue({ id: POST_ID, source_reference: null } as never);
  const response = await call();
  expect(mockGetPost).toHaveBeenCalledWith(POST_ID, VIEWER_ID, true);
  expect(await response.json()).toEqual({ reference: null });
});

it("guests are asked as nobody", async () => {
  mockGetPost.mockResolvedValue({ id: POST_ID, source_reference: REFERENCE } as never);
  await call();
  expect(mockGetPost).toHaveBeenCalledWith(POST_ID, null, true);
});

it("a post the viewer cannot see is a 404 with nothing in it", async () => {
  mockGetPost.mockResolvedValue(null);
  const response = await call();
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.reference).toBeUndefined();
  expect(body.errorCode).toBe("POSTS_NOT_FOUND");
});

it("rejects an id that is not a UUID without looking it up", async () => {
  const response = await call("not-a-uuid");
  expect(response.status).toBe(400);
  expect(mockGetPost).not.toHaveBeenCalled();
});

it("a failure is a 500, not a crash", async () => {
  mockGetPost.mockRejectedValue(new Error("db down"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  const response = await call();
  expect(response.status).toBe(500);
  expect((await response.json()).errorCode).toBe("POSTS_SOURCE_REFERENCE_FAILED");
});

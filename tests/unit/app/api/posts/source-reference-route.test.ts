/** @jest-environment node */

/**
 * GET /api/posts/[id]/source-reference のテスト。
 *
 * アプリの投稿詳細の参照カード用。投稿詳細と同じ部品（canViewerSeePost・
 * resolveSourcePromptReference・applyViewerToSourceReference）をつなぐだけなので、
 * ここでは「見せられない投稿では引かない・閲覧者を渡す・本文を読まない・キャッシュさせない」
 * を確かめる。部品の中身は post-viewer-gate / source-prompt-viewer のテストで確かめる。
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({ isFullAdmin: jest.fn(() => false) }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/posts/lib/post-viewer-gate", () => ({ canViewerSeePost: jest.fn() }));
jest.mock("@/features/posts/lib/source-prompt-reference", () => ({
  resolveSourcePromptReference: jest.fn(),
  applyViewerToSourceReference: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/posts/[id]/source-reference/route";
import { getUser } from "@/lib/auth";
import { isFullAdmin } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { canViewerSeePost } from "@/features/posts/lib/post-viewer-gate";
import {
  applyViewerToSourceReference,
  resolveSourcePromptReference,
} from "@/features/posts/lib/source-prompt-reference";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockIsFullAdmin = isFullAdmin as jest.MockedFunction<typeof isFullAdmin>;
const mockAdmin = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockGate = canViewerSeePost as jest.MockedFunction<typeof canViewerSeePost>;
const mockResolve = resolveSourcePromptReference as jest.MockedFunction<
  typeof resolveSourcePromptReference
>;
const mockApply = applyViewerToSourceReference as jest.MockedFunction<
  typeof applyViewerToSourceReference
>;

const POST_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const ROW = {
  id: POST_ID,
  user_id: "33333333-3333-4333-8333-333333333333",
  is_posted: true,
  moderation_status: "visible",
  generation_type: "free",
  source_post_id: null,
  source_author_id: null,
};
const REFERENCE = {
  postId: POST_ID,
  isAvailable: true,
  authorId: ROW.user_id,
  authorNickname: "原作者さん",
  authorAvatarUrl: null,
  thumbnailUrl: "https://cdn/thumb.webp",
  thumbnailWidth: 768,
  thumbnailHeight: 1376,
  beforeThumbnailUrl: "https://cdn/before.webp",
  promptVisibility: "public" as const,
  usageCount: 12,
};

let selectedColumns = "";
function stubRow(row: unknown, error: unknown = null) {
  mockAdmin.mockReturnValue({
    from: () => ({
      select: (columns: string) => {
        selectedColumns = columns;
        return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error }) }) };
      },
    }),
  } as never);
}

function call(id = POST_ID) {
  return GET(new NextRequest(`https://www.persta.ai/api/posts/${id}/source-reference`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue(null);
  mockIsFullAdmin.mockReturnValue(false);
  mockGate.mockResolvedValue(true);
  mockResolve.mockResolvedValue(REFERENCE);
  mockApply.mockImplementation(async (reference) => reference);
  stubRow(ROW);
});

it("returns the viewer's card, never caches it, and never reads the prompt", async () => {
  mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ reference: REFERENCE });
  // 本文の列(prompt)を読まない
  expect(selectedColumns).not.toMatch(/prompt/);
  expect(mockGate).toHaveBeenCalledWith(expect.anything(), ROW, VIEWER_ID, false);
  expect(mockApply).toHaveBeenCalledWith(REFERENCE, VIEWER_ID, expect.anything());
});

it("guests are judged as nobody", async () => {
  await call();
  expect(mockGate).toHaveBeenCalledWith(expect.anything(), ROW, null, false);
  expect(mockApply).toHaveBeenCalledWith(REFERENCE, null, expect.anything());
});

it("passes the admin flag like the web detail", async () => {
  mockGetUser.mockResolvedValue({ id: VIEWER_ID } as never);
  mockIsFullAdmin.mockReturnValue(true);
  await call();
  expect(mockGate).toHaveBeenCalledWith(expect.anything(), ROW, VIEWER_ID, true);
});

it("returns what the viewer check decided (e.g. a withdrawn original)", async () => {
  mockApply.mockResolvedValue({ ...REFERENCE, isAvailable: false, thumbnailUrl: null, beforeThumbnailUrl: null });
  const body = await (await call()).json();
  expect(body.reference.isAvailable).toBe(false);
  expect(body.reference.beforeThumbnailUrl).toBeNull();
});

it.each([
  ["a post the viewer may not see", () => mockGate.mockResolvedValue(false)],
  ["a post that does not exist", () => stubRow(null)],
])("%s is a 404 without resolving a card", async (_name, arrange) => {
  arrange();
  const response = await call();
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.reference).toBeUndefined();
  expect(body.errorCode).toBe("POSTS_NOT_FOUND");
  expect(mockResolve).not.toHaveBeenCalled();
});

it("rejects an id that is not a UUID without looking it up", async () => {
  const response = await call("not-a-uuid");
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mockAdmin).not.toHaveBeenCalled();
});

it("a failure is a 500 that is not cached", async () => {
  stubRow(null, { message: "db down" });
  jest.spyOn(console, "error").mockImplementation(() => {});
  const response = await call();
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await response.json()).errorCode).toBe("POSTS_SOURCE_REFERENCE_FAILED");
});

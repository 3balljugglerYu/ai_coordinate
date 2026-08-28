/** @jest-environment node */

import { NextResponse } from "next/server";
import { POST as backfillRoute } from "@/app/api/admin/hashtags/backfill/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPostHashtags } from "@/features/posts/lib/hashtag-sync";

jest.mock("@/lib/auth");
jest.mock("@/lib/supabase/admin");
jest.mock("@/features/posts/lib/hashtag-sync");

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockSyncPostHashtags = syncPostHashtags as jest.MockedFunction<
  typeof syncPostHashtags
>;

/** 公開中の投稿を返す PostgREST クエリビルダのモック。 */
function mockPosts(rows: Array<{ id: string; caption: string | null }>) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
  mockCreateAdminClient.mockReturnValue({
    from: jest.fn().mockReturnValue(builder),
  } as never);
  return builder;
}

describe("POST /api/admin/hashtags/backfill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockSyncPostHashtags.mockResolvedValue({ syncedCount: 1, skipped: false });
  });

  test("運営以外は実行できない", async () => {
    mockRequireAdmin.mockRejectedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await backfillRoute();

    expect(response.status).toBe(403);
    expect(mockSyncPostHashtags).not.toHaveBeenCalled();
  });

  test("公開中の投稿を1件ずつ同期し、件数を返す", async () => {
    mockPosts([
      { id: "post-1", caption: "#冬服" },
      { id: "post-2", caption: "タグなし" },
    ]);
    mockSyncPostHashtags
      .mockResolvedValueOnce({ syncedCount: 1, skipped: false })
      .mockResolvedValueOnce({ syncedCount: 0, skipped: false });

    const response = await backfillRoute();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSyncPostHashtags).toHaveBeenCalledTimes(2);
    expect(mockSyncPostHashtags).toHaveBeenCalledWith("post-1", "#冬服");
    expect(json).toEqual({
      scannedPosts: 2,
      taggedPosts: 1,
      syncedTags: 1,
      truncated: false,
    });
  });

  test("公開中かつ caption のある投稿だけを対象にする", async () => {
    const builder = mockPosts([]);

    await backfillRoute();

    expect(builder.eq).toHaveBeenCalledWith("is_posted", true);
    expect(builder.eq).toHaveBeenCalledWith("moderation_status", "visible");
    expect(builder.not).toHaveBeenCalledWith("caption", "is", null);
  });

  test("取得に失敗したら 500 を返す", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: "boom" } }),
      }),
    } as never);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await backfillRoute();

    expect(response.status).toBe(500);
    expect(mockSyncPostHashtags).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

/** @jest-environment node */

import {
  HASHTAG_SYNC_FAILURE_LOG_PREFIX,
  syncPostHashtags,
} from "@/features/posts/lib/hashtag-sync";
import { createAdminClient } from "@/lib/supabase/admin";

jest.mock("@/lib/supabase/admin");

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function mockRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  mockCreateAdminClient.mockReturnValue({ rpc } as never);
  return rpc;
}

describe("syncPostHashtags", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test("抽出したタグと保存済みキャプションを RPC に渡す", async () => {
    const rpc = mockRpc({ data: 2 });

    const result = await syncPostHashtags("post-1", "今日は #冬服 と #AI");

    expect(rpc).toHaveBeenCalledWith("sync_post_hashtags", {
      p_post_id: "post-1",
      p_tags: [
        { name: "冬服", normalized: "冬服" },
        { name: "AI", normalized: "ai" },
      ],
      p_expected_caption: "今日は #冬服 と #AI",
    });
    expect(result).toEqual({ syncedCount: 2, skipped: false });
  });

  test("タグが無いキャプションでも RPC を呼ぶ（洗い替えのため）", async () => {
    // タグを消す編集を反映するには、空配列でも呼ぶ必要がある。
    const rpc = mockRpc({ data: 0 });

    await syncPostHashtags("post-1", "タグのない説明");

    expect(rpc).toHaveBeenCalledWith(
      "sync_post_hashtags",
      expect.objectContaining({ p_tags: [] })
    );
  });

  test("キャプションが null なら空文字で照合する", async () => {
    const rpc = mockRpc({ data: 0 });

    await syncPostHashtags("post-1", null);

    expect(rpc).toHaveBeenCalledWith(
      "sync_post_hashtags",
      expect.objectContaining({ p_tags: [], p_expected_caption: "" })
    );
  });

  test("-1 はキャプション不一致。エラーログを出さずスキップとして返す", async () => {
    mockRpc({ data: -1 });

    const result = await syncPostHashtags("post-1", "#冬服");

    expect(result).toEqual({ syncedCount: 0, skipped: true });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("RPC エラーは投稿を落とさず、検索可能な接頭辞でログに残す", async () => {
    mockRpc({ error: { message: "boom" } });

    const result = await syncPostHashtags("post-1", "#冬服");

    expect(result).toEqual({ syncedCount: 0, skipped: false });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(HASHTAG_SYNC_FAILURE_LOG_PREFIX),
      expect.objectContaining({ postId: "post-1" })
    );
  });

  test("例外も投稿を落とさない", async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("no service role key");
    });

    const result = await syncPostHashtags("post-1", "#冬服");

    expect(result).toEqual({ syncedCount: 0, skipped: false });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(HASHTAG_SYNC_FAILURE_LOG_PREFIX),
      expect.objectContaining({ postId: "post-1" })
    );
  });
});

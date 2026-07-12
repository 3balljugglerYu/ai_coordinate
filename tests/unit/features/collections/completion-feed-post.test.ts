/** @jest-environment node */

// 台紙作り直し時にフィード投稿サムネを貼り替える refreshCompletionFeedPostImage の回帰テスト。
// 従来は投稿行の画像が初回スナップショットのまま固定で、表紙変更後も古いサムネが残っていた
// (book/mount 共通の不具合)。

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

const uploadWebPVariantsMock = jest.fn();
jest.mock("@/features/generation/lib/webp-storage", () => ({
  uploadWebPVariants: (...args: unknown[]) => uploadWebPVariantsMock(...args),
}));

// buildPublicGeneratedImageUrl は URL 組み立てだけなので実物を使う(env に依存)。
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

import { refreshCompletionFeedPostImage } from "@/features/collections/lib/completion-feed-post";
import type { SupabaseClient } from "@supabase/supabase-js";

/** generated_images に対する select().eq().maybeSingle() と update().eq() を記録するフェイク。 */
function makeClient(existingRow: { id: string } | null) {
  const update = jest.fn();
  const updateEq = jest.fn().mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: updateEq });

  const client = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: existingRow }),
        })),
      })),
      update,
    })),
  } as unknown as SupabaseClient;
  return { client, update, updateEq };
}

describe("refreshCompletionFeedPostImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadWebPVariantsMock.mockResolvedValue({
      thumbPath: "path/mount-2.thumb.webp",
      displayPath: "path/mount-2.display.webp",
    });
  });

  test("投稿行があれば新しい画像パスへ貼り替え、id を返す", async () => {
    const { client, update, updateEq } = makeClient({ id: "post-1" });

    const r = await refreshCompletionFeedPostImage(
      client,
      "completion-1",
      "path/mount-2.png",
    );

    expect(r.postId).toBe("post-1");
    expect(uploadWebPVariantsMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/public/generated-images/path/mount-2.png",
      "path/mount-2.png",
    );
    // 画像4列を最新へ + width/height をクリア
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url:
          "https://example.supabase.co/storage/v1/object/public/generated-images/path/mount-2.png",
        storage_path: "path/mount-2.png",
        storage_path_display: "path/mount-2.display.webp",
        storage_path_thumb: "path/mount-2.thumb.webp",
        width: null,
        height: null,
      }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", "post-1");
  });

  test("投稿行が無ければ何もせず null(WebP生成もしない)", async () => {
    const { client, update } = makeClient(null);

    const r = await refreshCompletionFeedPostImage(
      client,
      "completion-1",
      "path/mount-2.png",
    );

    expect(r.postId).toBeNull();
    expect(uploadWebPVariantsMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("WebP生成が失敗しても throw せず null(作り直し自体は成功させる)", async () => {
    const { client } = makeClient({ id: "post-1" });
    uploadWebPVariantsMock.mockRejectedValue(new Error("boom"));

    const r = await refreshCompletionFeedPostImage(
      client,
      "completion-1",
      "path/mount-2.png",
    );

    expect(r.postId).toBeNull();
  });
});

/** @jest-environment node */

/**
 * 投稿カード右下「元画像 ✔︎」ラベルの表示条件のテスト。
 *
 * 判定は `getPostBeforeImageUrl` に委ねている。`show_before_image` は
 * DEFAULT TRUE のため、これ単体で判定すると**生成元を持たない投稿
 * （じゆうモード等）にもラベルが付いてしまう**。正典の解決ロジックを使うことで
 * 「実際に生成元が見られる投稿」だけに出ることを固定する。
 */

// getImageUrlFromStoragePath は NEXT_PUBLIC_SUPABASE_URL 未設定時に空文字を返す。
// 未設定のままだと永続パスありのケースが誤って false になるため、テスト用に設定する。
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

import { getPostBeforeImageUrl } from "@/features/posts/lib/utils";

const STORAGE_PATH = "user-1/pre-generation/img-1_display.webp";

/** カード側の判定と同じ式。 */
function shouldShowSourceLabel(post: {
  pre_generation_storage_path?: string | null;
  input_image_url_fallback?: string | null;
  show_before_image?: boolean;
}): boolean {
  return getPostBeforeImageUrl(post) !== null;
}

describe("元画像ラベルの表示条件", () => {
  it("生成元があり、表示ONならラベルを出す", () => {
    expect(
      shouldShowSourceLabel({
        pre_generation_storage_path: STORAGE_PATH,
        show_before_image: true,
      })
    ).toBe(true);
  });

  it("生成元があっても、表示OFFならラベルを出さない", () => {
    expect(
      shouldShowSourceLabel({
        pre_generation_storage_path: STORAGE_PATH,
        show_before_image: false,
      })
    ).toBe(false);
  });

  it("生成元が無ければ、show_before_image が未指定でもラベルを出さない", () => {
    // show_before_image は DEFAULT TRUE なので、これを単体で見ると
    // じゆうモード等の生成元を持たない投稿にもラベルが付いてしまう。
    expect(shouldShowSourceLabel({ show_before_image: undefined })).toBe(false);
    expect(shouldShowSourceLabel({})).toBe(false);
  });

  it("生成元が無く show_before_image が true でもラベルを出さない", () => {
    // ここが今回のラベルで一番間違えやすい条件
    expect(
      shouldShowSourceLabel({
        pre_generation_storage_path: null,
        show_before_image: true,
      })
    ).toBe(false);
  });

  it("永続パスが未生成でも fallback があればラベルを出す", () => {
    // 単体取得の投稿詳細では楽観表示用の fallback が入る
    expect(
      shouldShowSourceLabel({
        pre_generation_storage_path: null,
        input_image_url_fallback: "https://example.com/before.png",
        show_before_image: true,
      })
    ).toBe(true);
  });

  it("表示OFFなら fallback があってもラベルを出さない", () => {
    expect(
      shouldShowSourceLabel({
        input_image_url_fallback: "https://example.com/before.png",
        show_before_image: false,
      })
    ).toBe(false);
  });
});

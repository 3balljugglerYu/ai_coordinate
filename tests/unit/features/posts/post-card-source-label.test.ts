/** @jest-environment node */

/**
 * 投稿カード右下「元画像 ✔︎」ラベルの表示条件のテスト。
 *
 * Persta の生成は必ず画像アップロードを伴うため、生成元自体はどの投稿にも存在する。
 * しかし「表示用に永続化された画像」は全投稿にはなく、Before/After 表示機能より前の
 * 投稿には `pre_generation_storage_path` が無い（本番実測: 投稿済み 919 件中 189 件）。
 *
 * ラベルは「タップすれば生成元が見られる」期待を持たせるため、チェックの有無ではなく
 * **実際に表示できるか**で判定する。正典の `getPostBeforeImageUrl` に委ねることで、
 * 表示ロジックと判定が同じ関数を通り将来ずれない。
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

  it("表示手段が無ければ、show_before_image が未指定でもラベルを出さない", () => {
    expect(shouldShowSourceLabel({ show_before_image: undefined })).toBe(false);
    expect(shouldShowSourceLabel({})).toBe(false);
  });

  it("永続画像が無ければ show_before_image が true でもラベルを出さない", () => {
    // Before/After 表示機能より前の投稿がこれに該当する（本番で 176 件）。
    // 生成元はアップロードされているが表示用の画像が残っていないため、
    // ラベルを出すと「タップしても見られない」裏切りになる。
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

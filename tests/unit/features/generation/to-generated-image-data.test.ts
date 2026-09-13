import { toGeneratedImageData } from "@/features/generation/lib/to-generated-image-data";

/**
 * 一覧表示用の変換。初回取得と追加読み込みの両方がこれを使う。
 *
 * ⭐ `url`(原本)と `displayUrl`(表示用WebP)の役割が入れ替わると、
 * ダウンロードで劣化した画像が保存される / 一覧が約1.9MB を読み続ける、の
 * どちらかが起きる。どちらも画面を見ただけでは気づけないので固定する。
 */
jest.mock("@/features/posts/lib/utils", () => ({
  getImageUrlFromStoragePath: (path: string) =>
    `https://example.test/storage/${path}`,
}));

const ORIGINAL = "https://example.test/original/abc.png";

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "image-1",
    image_url: ORIGINAL,
    storage_path_display: "generated/abc_display.webp",
    is_posted: false,
    ...overrides,
  };
}

describe("toGeneratedImageData", () => {
  it("表示用は WebP、url は原本のまま返す", () => {
    const result = toGeneratedImageData(buildRecord());

    expect(result?.displayUrl).toBe(
      "https://example.test/storage/generated/abc_display.webp"
    );
    // ⭐ ダウンロードがこれを読む。表示用に差し替えてはいけない
    expect(result?.url).toBe(ORIGINAL);
  });

  it("表示用 WebP が無い行では displayUrl を null にする", () => {
    // WebP 化の前に作られた古い行と、生成直後でまだ変換が終わっていない行
    const result = toGeneratedImageData(
      buildRecord({ storage_path_display: null })
    );

    expect(result?.displayUrl).toBeNull();
    expect(result?.url).toBe(ORIGINAL);
  });

  it("id が無い行は落とす", () => {
    expect(toGeneratedImageData(buildRecord({ id: null }))).toBeNull();
  });

  it("既存の項目を落とさない", () => {
    const result = toGeneratedImageData(
      buildRecord({
        prompt: "テスト",
        source_image_stock_id: "stock-1",
        pre_generation_storage_path: "before/abc.webp",
        show_before_image: false,
        source_post_id: "post-1",
        is_posted: true,
      })
    );

    expect(result).toMatchObject({
      prompt: "テスト",
      fromStock: true,
      preGenerationStoragePath: "before/abc.webp",
      showBeforeImage: false,
      sourcePostId: "post-1",
      is_posted: true,
    });
  });
});

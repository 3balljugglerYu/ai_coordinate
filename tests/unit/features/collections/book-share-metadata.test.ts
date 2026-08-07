/**
 * book 完走ビューのシェア文言。
 *
 * 以前は「うちの子の旅行日記(スクラップブック)。」が定数だったため、
 * book 表示に加わった別カテゴリ(ファッション雑誌など)をシェアしても
 * OGP / X カードに「旅行日記」と出てしまっていた。カテゴリ名から
 * 組み立てることで、カテゴリが増えても文言が追従することを固定する。
 */
import {
  BOOK_SHARE_FALLBACK_TITLE,
  buildBookShareDescription,
} from "@/features/collections/lib/book-share-metadata";

describe("buildBookShareDescription", () => {
  test("表示名をそのまま使う", () => {
    expect(buildBookShareDescription("🇮🇹 うちの子のイタリア旅行日記")).toBe(
      "🇮🇹 うちの子のイタリア旅行日記。あなたのうちの子でも作れます。"
    );
  });

  test("カテゴリが変われば文言も追従する（旅行日記に固定されない）", () => {
    const description = buildBookShareDescription("うちの子のファッション雑誌：夏");

    expect(description).toBe(
      "うちの子のファッション雑誌：夏。あなたのうちの子でも作れます。"
    );
    expect(description).not.toContain("旅行日記");
  });

  test("表示名に既に含まれる「うちの子の」を重複させない", () => {
    // 実データの display_name_ja は「うちの子の…」で始まる。
    // 接頭辞を足すと「うちの子のうちの子の…」になる。
    const description = buildBookShareDescription("うちの子のファッション雑誌：夏");

    expect(description).not.toContain("うちの子のうちの子");
  });

  test.each([null, undefined, "", "   "])(
    "名前が %p のときは中立な文言へフォールバックする",
    (value) => {
      expect(buildBookShareDescription(value as string | null | undefined)).toBe(
        "Persta.AI のコレクション作品です。"
      );
    }
  );

  test("フォールバックのタイトルも特定の企画名に依存しない", () => {
    expect(BOOK_SHARE_FALLBACK_TITLE).not.toContain("旅行日記");
  });
});

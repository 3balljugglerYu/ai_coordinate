/** @jest-environment node */

/**
 * ハロウィン企画のページをサイトマップに載せる(2026-10-17 に検索へ出したため)。
 * 応募規約のページは検索に出さないので載せない。
 */

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

// 投稿・企画の取得はこのテストの関心の外。DB に届かないよう、呼ばれたら失敗させる
// （sitemap 側は失敗を握って静的ページだけで成立させる作り）
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("DB is not available in this test");
  },
}));

jest.mock("@/features/style-presets/lib/style-preset-repository", () => ({
  listPublishedStylePresets: jest.fn(async () => []),
}));

import sitemap from "@/app/sitemap";

async function sitemapPathnames(): Promise<string[]> {
  const entries = await sitemap();
  return entries.map((entry) => new URL(entry.url).pathname);
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  // sitemap は取得の打ち切りに10秒のタイマーを張る。実タイマーを残さない
  jest.useFakeTimers();
  // 取得失敗のログ(上の createAdminClient)を黙らせる
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  jest.useRealTimers();
});

describe("sitemap とハロウィン企画のページ", () => {
  test("企画ページを1つだけ載せる(言語で分けないページなので、言語の付いた URL にしない)", async () => {
    const pathnames = await sitemapPathnames();

    expect(pathnames.filter((pathname) => pathname.includes("/campaigns/halloween-best-shot"))).toEqual([
      "/campaigns/halloween-best-shot",
    ]);
  });

  test("11月の秋のひととき企画のページも1つだけ載せ、応募規約のページは載せない(2026-10-30)", async () => {
    const pathnames = await sitemapPathnames();

    expect(pathnames.filter((pathname) => pathname.includes("/campaigns/autumn-moment"))).toEqual([
      "/campaigns/autumn-moment",
    ]);
  });
});

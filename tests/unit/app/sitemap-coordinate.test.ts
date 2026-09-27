/** @jest-environment node */

/**
 * サイトマップから廃止した Coordinate（/coordinate）を外す。
 * 旧 URL は Free Style へ転送しているので、検索エンジンには転送先の方を渡す
 * （docs/planning/coordinate-mode-deprecation-plan.md）。
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
import { locales } from "@/i18n/config";

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

describe("sitemap と Coordinate の廃止", () => {
  test("どの言語の /coordinate も載せない", async () => {
    const pathnames = await sitemapPathnames();

    expect(
      pathnames.filter((pathname) => /\/coordinate$/.test(pathname))
    ).toEqual([]);
  });

  test("転送先の Free Style は全言語で載せたまま", async () => {
    const pathnames = await sitemapPathnames();

    for (const locale of locales) {
      expect(pathnames).toContain(`/${locale}/free`);
    }
  });
});

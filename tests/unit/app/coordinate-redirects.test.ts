/** @jest-environment node */

/**
 * 生成モード Coordinate の廃止（docs/planning/coordinate-mode-deprecation-plan.md）。
 * 旧 URL は Free Style へ転送する。
 *
 * next.config.ts の redirects() を実際に読み、Next 本体がリクエストの照合と
 * 転送先の組み立てに使う関数（getPathMatch / prepareDestination）へ通す。
 * 設定の書き写しではなく、配線そのものを確かめるため。
 */

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import nextConfig from "../../../next.config";
import { locales } from "@/i18n/config";

type Redirect = { source: string; destination: string; permanent?: boolean };

async function loadRedirects(): Promise<Redirect[]> {
  const redirects = await nextConfig.redirects?.();
  return (redirects ?? []) as Redirect[];
}

/**
 * Next のサーバーと同じ照合（strict・名前無し引数を落とす）で最初に一致した転送を返す。
 * 一致しなければ null。
 */
async function resolveRedirect(
  pathname: string,
  query: Record<string, string> = {}
) {
  for (const redirect of await loadRedirects()) {
    const match = getPathMatch(redirect.source, {
      strict: true,
      removeUnnamedParams: true,
    });
    const params = match(pathname);
    if (!params) continue;

    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: redirect.destination,
      params,
      query,
    });
    return {
      pathname: parsedDestination.pathname,
      query: parsedDestination.query,
      permanent: redirect.permanent,
    };
  }
  return null;
}

describe("Coordinate の旧 URL の転送", () => {
  test("ロケール無しの /coordinate は /free へ一時転送し、クエリを保つ", async () => {
    await expect(
      resolveRedirect("/coordinate", { claim_wardrobe: "1" })
    ).resolves.toEqual({
      pathname: "/free",
      query: { claim_wardrobe: "1" },
      permanent: false,
    });
  });

  test.each(locales.map((locale) => [locale]))(
    "/%s/coordinate は同じロケールの /free へ一時転送する",
    async (locale) => {
      await expect(
        resolveRedirect(`/${locale}/coordinate`, { x: "1" })
      ).resolves.toEqual({
        pathname: `/${locale}/free`,
        query: { x: "1" },
        permanent: false,
      });
    }
  );

  test.each([
    // /styles/[slug] など、ロケールでない1階層の下にある coordinate
    "/styles/coordinate",
    // 実際に配信される形(ロケール付き)の /styles/[slug]
    "/ja/styles/coordinate",
    "/posts/coordinate",
    // ロケールの形をしているが対応していない
    "/xx/coordinate",
    // 下の階層
    "/coordinate/x",
    "/ja/coordinate/x",
    // 似た名前
    "/coordinates",
    "/ja/coordinate-guide",
  ])("%s は転送しない", async (pathname) => {
    await expect(resolveRedirect(pathname)).resolves.toBeNull();
  });

  test("既存の転送はそのまま", async () => {
    await expect(resolveRedirect("/event/detail/01")).resolves.toEqual({
      pathname: "/free-materials",
      query: {},
      permanent: true,
    });
    await expect(resolveRedirect("/thanks")).resolves.toEqual({
      pathname: "/thanks-sample",
      query: {},
      permanent: true,
    });
  });
});

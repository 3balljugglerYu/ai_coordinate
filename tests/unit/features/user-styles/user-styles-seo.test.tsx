/** @jest-environment node */

/**
 * /user-styles の SEO 面。
 *
 * ここが誤ると (a) 公開前の URL を検索エンジンに載せて 404 へ誘導する、
 * (b) 一覧と投稿詳細の関係が伝わらない、(c) canonical がロケールを落とす。
 */

jest.mock("next/navigation", () => ({ notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  getSiteUrl: jest.fn(() => "https://persta.ai"),
  isUserStylesAvailable: jest.fn(() => true),
  isUserStylesPubliclyEnabled: jest.fn(() => true),
}));
jest.mock("@/features/user-styles/lib/get-user-style-page", () => ({
  getUserStylePage: jest.fn().mockResolvedValue({ posts: [], nextCursor: null }),
}));
jest.mock("@/features/user-styles/lib/get-public-user-style-page", () => ({
  getPublicUserStyleFirstPage: jest.fn(),
}));
jest.mock("@/features/style-presets/components/OriginalKindTabs", () => ({
  OriginalKindTabs: () => null,
}));
jest.mock("@/features/user-styles/components/UserStylesFeedClient", () => ({
  UserStylesFeedClient: () => null,
}));
jest.mock("@/features/user-styles/components/UserStylesFeedSkeleton", () => ({
  UserStylesFeedSkeleton: () => null,
}));

import UserStylesPage, { generateMetadata } from "@/app/(styles-catalog)/user-styles/page";
import { getPublicUserStyleFirstPage } from "@/features/user-styles/lib/get-public-user-style-page";
import { isUserStylesPubliclyEnabled } from "@/lib/env";
import { isSitemapPathEnabled } from "@/lib/sitemap-paths";
import type { Post } from "@/features/posts/types";

const mockPublicPage = getPublicUserStyleFirstPage as jest.MockedFunction<
  typeof getPublicUserStyleFirstPage
>;
const mockPublic = isUserStylesPubliclyEnabled as jest.MockedFunction<
  typeof isUserStylesPubliclyEnabled
>;

function post(id: string): Post {
  return { id } as unknown as Post;
}

type ReactNodeish = {
  props?: {
    dangerouslySetInnerHTML?: { __html?: string };
    children?: unknown;
  };
};

/**
 * 描画結果の要素ツリーを辿って JSON-LD を取り出す。
 * 文字列化して正規表現で拾うと、本文のエスケープで簡単に壊れる。
 */
function readJsonLd(tree: unknown): Record<string, unknown> {
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop() as ReactNodeish | null;
    if (!node || typeof node !== "object") {
      continue;
    }
    const html = node.props?.dangerouslySetInnerHTML?.__html;
    if (typeof html === "string") {
      return JSON.parse(html);
    }
    const children = node.props?.children;
    if (Array.isArray(children)) {
      stack.push(...children);
    } else if (children) {
      stack.push(children);
    }
  }
  throw new Error("JSON-LD が見つからない");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPublic.mockReturnValue(true);
  mockPublicPage.mockResolvedValue({ posts: [], nextCursor: null });
});

describe("sitemap の段階公開ゲート", () => {
  /*
    ⭐ `LOCALIZED_PUBLIC_PATHS` へ足すだけでは、公開前の URL が全ロケールぶん
    sitemap に載って 404 へ誘導される（PR #638 レビュー#5）。
  */
  test("フラグ無効なら /user-styles を載せない", () => {
    mockPublic.mockReturnValue(false);
    expect(isSitemapPathEnabled("/user-styles")).toBe(false);
  });

  test("フラグ有効なら載せる", () => {
    mockPublic.mockReturnValue(true);
    expect(isSitemapPathEnabled("/user-styles")).toBe(true);
  });

  test("他のパスはフラグに関係なく載せる", () => {
    mockPublic.mockReturnValue(false);
    for (const path of ["/", "/styles", "/about"]) {
      expect(isSitemapPathEnabled(path)).toBe(true);
    }
  });
});

describe("JSON-LD", () => {
  test("投稿詳細への ItemList を出す", async () => {
    mockPublicPage.mockResolvedValue({
      posts: [post("p1"), post("p2")],
      nextCursor: null,
    });

    const jsonLd = readJsonLd(
      await UserStylesPage({ params: Promise.resolve({ locale: "ja" }) })
    );

    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, url: "https://persta.ai/ja/posts/p1" },
      { "@type": "ListItem", position: 2, url: "https://persta.ai/ja/posts/p2" },
    ]);
  });

  /*
    ⭐ 閲覧者に依らない公開分だけで組む。検索エンジンに出す一覧が
    閲覧者によって変わってはいけない（/styles と同じ方針）。
  */
  test("閲覧者依存の取得ではなく公開分の1ページ目から組む", async () => {
    await UserStylesPage({ params: Promise.resolve({ locale: "ja" }) });

    expect(mockPublicPage).toHaveBeenCalled();
  });

  test("50件で打ち切る（sitemap ではなく一覧の構造化データなので）", async () => {
    mockPublicPage.mockResolvedValue({
      posts: Array.from({ length: 60 }, (_, i) => post(`p${i}`)),
      nextCursor: null,
    });

    const jsonLd = readJsonLd(
      await UserStylesPage({ params: Promise.resolve({ locale: "ja" }) })
    );

    expect(jsonLd.itemListElement as unknown[]).toHaveLength(50);
  });

  test("id を持たない行は落とす（壊れた URL を出さない）", async () => {
    mockPublicPage.mockResolvedValue({
      posts: [post("p1"), {} as Post],
      nextCursor: null,
    });

    const jsonLd = readJsonLd(
      await UserStylesPage({ params: Promise.resolve({ locale: "ja" }) })
    );

    expect(jsonLd.itemListElement as unknown[]).toHaveLength(1);
  });
});

describe("掲載条件の明示（REQ-015）", () => {
  /** 要素ツリーからテキストを集める。 */
  function collectText(node: unknown, out: string[] = []): string[] {
    if (typeof node === "string") {
      out.push(node);
      return out;
    }
    if (Array.isArray(node)) {
      for (const child of node) collectText(child, out);
      return out;
    }
    const children = (node as { props?: { children?: unknown } })?.props?.children;
    if (children) collectText(children, out);
    return out;
  }

  /*
    ⭐ 掲載条件を書かずに並べると、運営が見繕っているように見えて
    「勝手に使われている」と受け取られる。並び順の根拠を書けるのは、
    機械的な条件であるうちだけ（計画書 ADR-009 / REQ-015）。
  */
  test("Before / After が条件であることを画面に書く", async () => {
    const texts = collectText(
      await UserStylesPage({ params: Promise.resolve({ locale: "ja" }) })
    );

    expect(texts.join("\n")).toContain("Before / After");
  });

  test("ロケールごとの文言を使う（日本語を焼き込まない）", async () => {
    const texts = collectText(
      await UserStylesPage({ params: Promise.resolve({ locale: "en" }) })
    ).join("\n");

    expect(texts).toContain("Before / After");
    expect(texts).not.toContain("表示しています");
  });
});

describe("canonical と hreflang", () => {
  /*
    ⭐ `/user-styles` が PUBLIC_PATH_PATTERNS に無いと、canonical からも
    ロケールが落ちて全言語が同じ URL を指す。
  */
  test.each(["ja", "en", "ko"] as const)(
    "%s の canonical にロケールが付く",
    async (locale) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });

      // canonical は絶対 URL（createMarketingPageMetadata が siteUrl を付ける）
      expect(metadata.alternates?.canonical).toBe(
        `https://persta.ai/${locale}/user-styles`
      );
    }
  );

  test("hreflang に全ロケールが並ぶ", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    const languages = metadata.alternates?.languages ?? {};

    expect(Object.keys(languages).length).toBeGreaterThanOrEqual(15);
    expect(languages).toMatchObject({
      ja: "https://persta.ai/ja/user-styles",
      en: "https://persta.ai/en/user-styles",
    });
  });
});

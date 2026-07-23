import { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getSiteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_LOCALE,
  locales,
  localizePublicPath,
} from "@/i18n/config";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";

// ロケール展開する公開ページ(PUBLIC_PATH_PATTERNS に含まれるパス)
const LOCALIZED_PUBLIC_PATHS = [
  "/",
  "/style",
  "/coordinate",
  "/styles",
  "/search",
  "/about",
  "/pricing",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/credits/purchase",
  "/tokushoho",
  "/payment-services-act",
  "/thanks-sample",
  "/free-materials",
  "/catalog",
] as const;

// ロケール分割していない公開ページ(単一 URL で公開)
const UNLOCALIZED_PUBLIC_PATHS = ["/collections", "/creators", "/collab"] as const;

type LocalizedPath = (typeof LOCALIZED_PUBLIC_PATHS)[number];

function changeFrequencyFor(
  path: LocalizedPath
): NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> {
  if (path === "/" || path === "/search") return "daily";
  if (
    path === "/style" ||
    path === "/coordinate" ||
    path === "/styles" ||
    path === "/catalog"
  ) {
    return "daily";
  }
  if (path === "/credits/purchase" || path === "/free-materials") {
    return "weekly";
  }
  return "monthly";
}

function priorityFor(path: LocalizedPath): number {
  if (path === "/") return 1;
  if (path === "/style" || path === "/coordinate") return 0.9;
  if (path === "/styles" || path === "/search" || path === "/catalog") {
    return 0.8;
  }
  if (path === "/about" || path === "/credits/purchase") return 0.7;
  if (path === "/free-materials") return 0.6;
  if (path === "/terms" || path === "/privacy") return 0.5;
  return 0.4;
}

/**
 * hreflang アノテーション(sitemap の xhtml:link)。
 * 動的コンテンツはロケールごとに 15 エントリへ複製する代わりに、
 * デフォルトロケール URL 1 エントリ + 言語別 alternates で表現し、
 * sitemap の肥大(URL 数 × 15)を防ぐ。
 */
function buildLanguageAlternates(path: string, baseUrl: string) {
  return {
    languages: Object.fromEntries([
      ...locales.map((locale) => [
        locale,
        `${baseUrl}${localizePublicPath(path, locale)}`,
      ]),
      ["x-default", `${baseUrl}${localizePublicPath(path, DEFAULT_LOCALE)}`],
    ]),
  };
}

/**
 * sitemap のエントリを生成する。
 *
 * 重要: ここでは cookie ベースの `createClient()`(lib/supabase/server.ts)を
 * 使ってはならない。sitemap はリクエスト外(ビルド時プリレンダ)でも評価される
 * ため、`cookies()` に依存すると例外 → catch → 「静的ページのみの sitemap」に
 * 静かに縮退する(実際に本番でこの縮退が起きていた)。
 * リポジトリ層と同じ cookie 非依存の admin クライアントで公開データのみを
 * 明示条件(is_posted / published)付きで取得する。
 */
async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag("sitemap");
  // デプロイ後もビルド時スナップショットに固定されないよう、定期的に再検証する
  cacheLife("hours");

  const siteUrl = getSiteUrl() || "https://persta.ai";
  const baseUrl = siteUrl;

  // 主要な静的ページ(ロケール展開)
  // lastModified は省略（正確な更新日が不明なため。new Date() は生成のたびに変わり changeFrequency と矛盾する）
  const staticPages: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    LOCALIZED_PUBLIC_PATHS.map((path) => ({
      url: `${baseUrl}${localizePublicPath(path, locale)}`,
      changeFrequency: changeFrequencyFor(path),
      priority: priorityFor(path),
    }))
  );

  const unlocalizedPages: MetadataRoute.Sitemap = UNLOCALIZED_PUBLIC_PATHS.map(
    (path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })
  );

  // 投稿詳細ページ（最大1000件まで）
  // デフォルトロケール URL 1 エントリ + hreflang alternates で全ロケールを表現する
  let postPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    // 注意: generated_images に updated_at カラムは存在しない(select すると
    // 42703 でクエリ全体が失敗し、投稿が 1 件も sitemap に載らなくなる)。
    const { data: posts, error } = await supabase
      .from("generated_images")
      .select("id, posted_at")
      .eq("is_posted", true)
      .order("posted_at", { ascending: false })
      .limit(1000); // 1 sitemapあたり50,000 URL制限を考慮して1000件に制限

    if (!error && posts) {
      postPages = posts
        .filter((post) => post.id)
        .map((post) => {
          const path = `/posts/${post.id}`;
          return {
            url: `${baseUrl}${localizePublicPath(path, DEFAULT_LOCALE)}`,
            ...(post.posted_at
              ? { lastModified: new Date(post.posted_at) }
              : {}),
            changeFrequency: "weekly" as const,
            priority: 0.6,
            alternates: buildLanguageAlternates(path, baseUrl),
          };
        });
    } else if (error) {
      console.error("Failed to fetch posts for sitemap:", error);
    }
  } catch (error) {
    // エラーが発生した場合は、静的ページのみを返す
    console.error("Failed to fetch posts for sitemap:", error);
  }

  // 公開中の catalog 企画
  let catalogPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data: campaigns, error: campaignError } = await supabase
      .from("catalog_campaigns")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("display_order", { ascending: true })
      .limit(500);

    if (!campaignError && campaigns) {
      catalogPages = campaigns
        .filter((c) => c.slug)
        .map((c) => {
          const path = `/catalog/${c.slug}`;
          return {
            url: `${baseUrl}${localizePublicPath(path, DEFAULT_LOCALE)}`,
            lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.7,
            alternates: buildLanguageAlternates(path, baseUrl),
          };
        });
    } else if (campaignError) {
      console.error(
        "Failed to fetch catalog campaigns for sitemap:",
        campaignError
      );
    }
  } catch (error) {
    console.error("Failed to fetch catalog campaigns for sitemap:", error);
  }

  // 公開スタイル紹介ページ(/styles/[slug])
  let stylePages: MetadataRoute.Sitemap = [];
  try {
    const presets = await getPublishedStylePresets();
    stylePages = presets
      .filter((preset) => preset.slug)
      .map((preset) => {
        const path = `/styles/${preset.slug}`;
        return {
          url: `${baseUrl}${localizePublicPath(path, DEFAULT_LOCALE)}`,
          lastModified: new Date(preset.publishedAt ?? preset.createdAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
          alternates: buildLanguageAlternates(path, baseUrl),
        };
      });
  } catch (error) {
    console.error("Failed to fetch style presets for sitemap:", error);
  }

  return [
    ...staticPages,
    ...unlocalizedPages,
    ...stylePages,
    ...postPages,
    ...catalogPages,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}

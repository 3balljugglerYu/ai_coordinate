import { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { locales, localizePublicPath } from "@/i18n/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl() || "https://persta.ai";
  const baseUrl = siteUrl;
  const publicPaths = [
    "/",
    "/search",
    "/about",
    "/terms",
    "/privacy",
    "/pricing",
    "/tokushoho",
    "/payment-services-act",
    "/thanks-sample",
    "/free-materials",
  ] as const;

  // 主要な静的ページ
  // lastModified は省略（正確な更新日が不明なため。new Date() は生成のたびに変わり changeFrequency と矛盾する）
  const staticPages: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    publicPaths.map((path) => ({
      url: `${baseUrl}${localizePublicPath(path, locale)}`,
      changeFrequency:
        path === "/" || path === "/search"
          ? ("daily" as const)
          : path === "/pricing" || path === "/free-materials"
            ? ("weekly" as const)
            : ("monthly" as const),
      priority:
        path === "/"
          ? 1
          : path === "/search"
            ? 0.8
            : path === "/about" || path === "/pricing"
              ? 0.7
              : path === "/free-materials"
                ? 0.6
                : path === "/terms" || path === "/privacy"
                  ? 0.5
                  : 0.4,
    }))
  );

  // 投稿詳細ページを取得（最大1000件まで）
  // 注意: 投稿数が非常に多い場合は、sitemapの分割を検討
  let postPages: MetadataRoute.Sitemap = [];
  
  try {
    const supabase = await createClient();
    const { data: posts, error } = await supabase
      .from("generated_images")
      .select("id, posted_at, updated_at")
      .eq("is_posted", true)
      .order("posted_at", { ascending: false })
      .limit(1000); // 1 sitemapあたり50,000 URL制限を考慮して1000件に制限

    if (!error && posts) {
      postPages = locales.flatMap((locale) =>
        posts
          .filter((post) => post.id)
          .map((post) => ({
            url: `${baseUrl}${localizePublicPath(`/posts/${post.id}`, locale)}`,
            lastModified: post.updated_at
              ? new Date(post.updated_at)
              : post.posted_at
                ? new Date(post.posted_at)
                : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.6,
          }))
      );
    }
  } catch (error) {
    // エラーが発生した場合は、静的ページのみを返す
    console.error("Failed to fetch posts for sitemap:", error);
  }

  return [...staticPages, ...postPages];
}

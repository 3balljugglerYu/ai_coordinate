import { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl() || "https://persta.ai";
  const baseUrl = siteUrl;

  // 主要な静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

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
      postPages = posts
        .filter((post) => post.id) // idが存在するもののみ
        .map((post) => ({
          url: `${baseUrl}/posts/${post.id}`,
          lastModified: post.updated_at
            ? new Date(post.updated_at)
            : post.posted_at
            ? new Date(post.posted_at)
            : new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
    }
  } catch (error) {
    // エラーが発生した場合は、静的ページのみを返す
    console.error("Failed to fetch posts for sitemap:", error);
  }

  return [...staticPages, ...postPages];
}

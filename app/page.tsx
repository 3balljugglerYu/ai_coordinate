import { Suspense } from "react";
import type { Metadata } from "next";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";
import { StreakChecker } from "@/components/StreakChecker";
import { HomeBannerList } from "@/features/home/components/HomeBannerList";

export const metadata: Metadata = {
  openGraph: {
    title: "Persta.AI (ペルスタ)",
    description: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    url: getSiteUrl() || undefined,
    siteName: "Persta.AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Persta.AI (ペルスタ)",
    description: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
  },
};

async function PostListContent({
  forceInitialLoading = false,
}: {
  forceInitialLoading?: boolean;
}) {
  const posts = forceInitialLoading ? [] : await getPosts(20, 0, "newest");
  return <PostList initialPosts={posts} forceInitialLoading={forceInitialLoading} />;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const refreshParam = params.mod_refresh;
  const forceInitialLoading = Array.isArray(refreshParam)
    ? refreshParam.includes("1")
    : refreshParam === "1";
  const siteUrl = getSiteUrl() || "https://persta.ai";
  
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "logo": `${siteUrl}/icons/icon-512.png`,
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "description": "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <StreakChecker />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold">Persta | ペルスタ</h1>
          <p className="mt-2 text-muted-foreground">
            着てみたいも、なりたいも。AIスタイリングプラットフォーム
          </p>
        </div>
        <HomeBannerList />
        <Suspense fallback={<PostListSkeleton />}>
          <PostListContent forceInitialLoading={forceInitialLoading} />
        </Suspense>
      </div>
    </>
  );
}

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

async function PostListContent() {
  const posts = await getPosts(20, 0, "newest");
  return <PostList initialPosts={posts} />;
}

export default async function Home() {
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
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Persta（ペルスタ）とは</h2>
          <p className="text-base leading-relaxed mb-4">
            Persta（ペルスタ）は、AIで生成したファッションコーデ画像やキャラクター画像をシェアできるプラットフォームです。
            着てみたいも、なりたいも。AIスタイリングプラットフォームとして、みんなの作品を見て、インスピレーションを得ることができます。
          </p>
        </div>
        <HomeBannerList />
        <Suspense fallback={<PostListSkeleton />}>
          <PostListContent />
        </Suspense>
      </div>
    </>
  );
}

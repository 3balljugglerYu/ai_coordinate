import type { Metadata } from "next";
import { Suspense } from "react";
import { getSiteUrl } from "@/lib/env";
import { getUser } from "@/lib/auth";
import { HomeBannerList } from "@/features/home/components/HomeBannerList";
import { CachedHomePostList } from "@/features/posts/components/CachedHomePostList";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

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

export default async function Home() {
  const user = await getUser();
  const userId = user?.id ?? null;
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
      <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold">Persta | ペルスタ</h1>
          <p className="mt-2 text-muted-foreground">
            着てみたいも、なりたいも。AIスタイリングプラットフォーム
          </p>
        </div>
        <HomeBannerList />
        <Suspense fallback={<PostListSkeleton />}>
          <CachedHomePostList userId={userId} />
        </Suspense>
      </div>
    </>
  );
}

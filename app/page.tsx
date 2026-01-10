import { Suspense } from "react";
import type { Metadata } from "next";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";
import { StreakChecker } from "@/components/StreakChecker";

export const metadata: Metadata = {
  title: "Persta.AI - 着てみたいも、なりたいも。AIスタイリングプラットフォーム",
  description: "Persta.AIは、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。みんなの作品を見て、インスピレーションを得ましょう。",
  openGraph: {
    title: "Persta.AI",
    description: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    url: getSiteUrl() || undefined,
    siteName: "Persta.AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Persta.AI",
    description: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
  },
};

async function PostListContent() {
  const posts = await getPosts(20, 0, "newest");
  return <PostList initialPosts={posts} />;
}

export default async function Home() {
  return (
    <>
      <StreakChecker />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Persta | ペルスタ</h1>
          <p className="mt-2 text-muted-foreground">
            着てみたいも、なりたいも。AIスタイリングプラットフォーム
          </p>
        </div>
        <Suspense fallback={<PostListSkeleton />}>
          <PostListContent />
        </Suspense>
      </div>
    </>
  );
}

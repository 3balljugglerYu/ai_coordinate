import { Suspense } from "react";
import type { Metadata } from "next";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";

export const metadata: Metadata = {
  title: "AI Coordinate - AIで生成されたファッションコーディネートをシェア",
  description: "AI Coordinateは、AIで生成されたファッションコーディネート画像をシェアできるプラットフォームです。みんなのコーディネートを見て、インスピレーションを得ましょう。",
  openGraph: {
    title: "AI Coordinate",
    description: "AIで生成されたファッションコーディネートをシェア",
    url: getSiteUrl() || undefined,
    siteName: "AI Coordinate",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Coordinate",
    description: "AIで生成されたファッションコーディネートをシェア",
  },
};

async function PostListContent() {
  const posts = await getPosts(20, 0);
  return <PostList initialPosts={posts} />;
}

export default async function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-1">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">投稿一覧</h1>
        <p className="mt-2 text-muted-foreground">
          みんなのコーディネートを見てみましょう
        </p>
      </div>
      <Suspense fallback={<PostListSkeleton />}>
        <PostListContent />
      </Suspense>
    </div>
  );
}

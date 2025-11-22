import { Suspense } from "react";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

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

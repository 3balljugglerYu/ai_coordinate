import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { StickyHeader } from "@/features/posts/components/StickyHeader";

export default async function Home() {
  const posts = await getPosts(20, 0);

  return (
    <>
      <StickyHeader showBackButton={false} />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">投稿一覧</h1>
          <p className="mt-2 text-muted-foreground">
            みんなのコーディネートを見てみましょう
          </p>
        </div>
        <PostList initialPosts={posts} />
      </div>
    </>
  );
}

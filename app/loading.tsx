import { HomeBannerSkeleton } from "@/features/home/components/HomeBannerSkeleton";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

/**
 * ルートローディング（主にホーム画面）
 * 大きめのスケルトンではなく、各コンポーネントのスケルトンを表示
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
      <div className="mb-4">
        <h1 className="text-3xl font-bold">Persta | ペルスタ</h1>
        <p className="mt-2 text-muted-foreground">
          着てみたいも、なりたいも。AIスタイリングプラットフォーム
        </p>
      </div>
      <HomeBannerSkeleton />
      <PostListSkeleton />
    </div>
  );
}


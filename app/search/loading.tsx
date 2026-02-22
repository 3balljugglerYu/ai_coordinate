import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

/**
 * 検索画面用ローディング
 * 各コンポーネントのスケルトンを表示
 */
export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
      <div className="mb-4">
        <div className="h-8 w-24 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
      </div>
      <PostListSkeleton />
    </div>
  );
}

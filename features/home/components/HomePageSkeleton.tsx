import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

/**
 * ホームページのバナー + 投稿一覧部分のスケルトン。
 * page.tsx の Suspense fallback と loading.tsx の両方で使用。
 */
export function HomePageSkeleton() {
  return (
    <>
      <div className="mb-8 overflow-x-hidden">
        <div className="-mx-4 px-4">
          <div className="aspect-[3/1] w-full animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
      <PostListSkeleton />
    </>
  );
}

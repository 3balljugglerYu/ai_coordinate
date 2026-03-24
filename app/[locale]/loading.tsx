import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";

/**
 * [locale] ルート群用ローディング
 * PPR の自動生成ローディング UI を上書きし、
 * デフォルトロケール(英語)テキストのフラッシュを防止する
 */
export default function LocaleLoading() {
  return (
    <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
      <div className="mb-4">
        <div className="h-9 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-5 w-80 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="mb-8 overflow-x-hidden">
        <div className="-mx-4 px-4">
          <div className="aspect-[3/1] w-full animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
      <PostListSkeleton />
    </div>
  );
}

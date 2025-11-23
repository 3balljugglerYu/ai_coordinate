import { Heart, MessageCircle, Eye } from "lucide-react";

/**
 * 投稿詳細画面の統計情報スケルトンUI
 */
export function PostDetailStatsSkeleton() {
  return (
    <div className="flex items-center gap-3 justify-start">
      <div className="flex items-center gap-1.5">
        <Heart className="h-5 w-5 text-gray-300" />
        <div className="h-5 w-8 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="flex items-center gap-1">
        <MessageCircle className="h-4 w-4 text-gray-300" />
        <div className="h-4 w-6 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="flex items-center gap-1">
        <Eye className="h-4 w-4 text-gray-300" />
        <div className="h-4 w-6 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  );
}


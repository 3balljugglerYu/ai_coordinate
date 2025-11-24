"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { PostCardLikeButton } from "./PostCardLikeButton";
import { getPostImageUrl } from "../lib/utils";
import type { Post } from "../types";

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
}

export function PostCard({ post, currentUserId }: PostCardProps) {
  // Supabase Storageから画像URLを生成（image_urlがない場合はstorage_pathから生成）
  const imageUrl = getPostImageUrl(post);

  // 投稿者情報の表示（Phase 5でプロフィール画面へのリンクを追加予定）
  const displayName =
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    "匿名ユーザー";

  return (
    <Card className="overflow-hidden pt-0 pb-0 gap-1">
      <Link href={`/posts/${post.id}`}>
        <div className="relative w-full overflow-hidden bg-gray-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={post.caption || "投稿画像"}
              width={800}
              height={800}
              className="w-full h-auto object-contain transition-transform hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-gray-400">
              画像がありません
            </div>
          )}
        </div>
      </Link>

      <CardContent className="px-1 pt-0 pb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200">
            {post.user?.avatar_url ? (
              <Image
                src={post.user.avatar_url}
                alt={displayName}
                width={24}
                height={24}
                className="rounded-full object-cover"
              />
            ) : (
              <User className="h-3.5 w-3.5 text-gray-500" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-gray-900">
              {displayName}
            </span>
          </div>

          {/* いいねボタン + いいね数 + ビュー数 */}
          {post.id && (
            <PostCardLikeButton
              imageId={post.id}
              initialLikeCount={post.like_count || 0}
              initialViewCount={post.view_count || 0}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}


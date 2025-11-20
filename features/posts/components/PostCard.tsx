"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { getPostImageUrl } from "../lib/utils";
import type { Post } from "../types";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  // Supabase Storageから画像URLを生成（image_urlがない場合はstorage_pathから生成）
  const imageUrl = getPostImageUrl(post);

  // 投稿者情報の表示（Phase 5でプロフィール画面へのリンクを追加予定）
  const displayName =
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    "匿名ユーザー";

  return (
    <Card className="overflow-hidden">
      <Link href={`/posts/${post.id}`}>
        <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={post.caption || "投稿画像"}
              fill
              className="object-cover transition-transform hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              画像がありません
            </div>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200">
            {post.user?.avatar_url ? (
              <Image
                src={post.user.avatar_url}
                alt={displayName}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-gray-500" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">
              {displayName}
            </span>
            {post.caption && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                {post.caption}
              </p>
            )}
            {post.posted_at && (
              <p className="mt-1 text-xs text-gray-400">
                {new Date(post.posted_at).toLocaleDateString("ja-JP")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { PostCardLikeButton } from "./PostCardLikeButton";
import { getPostThumbUrl } from "../lib/utils";
import type { Post } from "../types";
import { PostModerationMenu } from "@/features/moderation/components/PostModerationMenu";

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
}

export function PostCard({ post, currentUserId }: PostCardProps) {
  const [isHidden, setIsHidden] = useState(false);
  // Supabase Storageから画像URLを生成（WebPサムネイル優先、フォールバック付き）
  const imageUrl = getPostThumbUrl(post);

  // 投稿者情報の表示（Phase 5でプロフィール画面へのリンクを追加予定）
  const displayName =
    post.user?.nickname ||
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    "匿名ユーザー";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    post.user?.avatar_url ?? null
  );
  const preloadLinkRef = useRef<HTMLLinkElement | null>(null);

  if (isHidden) {
    return null;
  }

  // 画像のプリロード処理（onMouseEnter/onTouchStart）
  const handlePreload = () => {
    if (!imageUrl) return;
    
    // 既にプリロード済みの場合はスキップ
    if (preloadLinkRef.current) return;

    // Next.jsのImageコンポーネントは既に最適化されているため、
    // 詳細ページへの遷移時に画像が再利用される
    // ここでは、Linkのprefetchで詳細ページ自体をプリフェッチする
  };

  const imageContent = (
    <div className="relative w-full overflow-hidden bg-gray-100">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={post.caption || "投稿画像"}
          width={800}
          height={800}
          className="w-full h-auto object-contain transition-transform hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
          unoptimized
        />
      ) : (
        <div className="flex aspect-square items-center justify-center text-gray-400">
          画像がありません
        </div>
      )}
    </div>
  );

  return (
    <Card className="overflow-hidden pt-0 pb-0 gap-1">
      {post.id ? (
        <Link 
          href={`/posts/${encodeURIComponent(post.id)}`}
          prefetch={false}
          onMouseEnter={handlePreload}
          onTouchStart={handlePreload}
        >
          {imageContent}
        </Link>
      ) : (
        imageContent
      )}

      <CardContent className="px-1 pt-0 pb-1">
        <div className="flex items-center gap-1">
          {post.user?.id ? (
            <Link
              href={`/users/${encodeURIComponent(post.user.id)}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 hover:opacity-80 transition-opacity"
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={24}
                  height={24}
                  className="rounded-full object-cover"
                  onError={() => setAvatarUrl(null)}
                />
              ) : (
                <User className="h-3.5 w-3.5 text-gray-500" />
              )}
            </Link>
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200">
              <User className="h-3.5 w-3.5 text-gray-500" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {post.user?.id ? (
              <Link
                href={`/users/${encodeURIComponent(post.user.id)}`}
                className="block truncate text-xs font-medium text-gray-900 hover:text-gray-600 transition-colors"
                title={displayName}
              >
                {displayName}
              </Link>
            ) : (
              <span className="block truncate text-xs font-medium text-gray-900">
                {displayName}
              </span>
            )}
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
          {post.id && (
            <PostModerationMenu
              postId={post.id}
              authorUserId={post.user_id}
              currentUserId={currentUserId}
              onHidden={() => setIsHidden(true)}
              showShare
              showBlock={false}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

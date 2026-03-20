"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { PostCardLikeButton } from "./PostCardLikeButton";
import { getPostThumbUrl } from "../lib/utils";
import type { Post } from "../types";
import { PostModerationMenu } from "@/features/moderation/components/PostModerationMenu";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
  isHighlighted?: boolean;
}

export function PostCard({
  post,
  currentUserId,
  isHighlighted = false,
}: PostCardProps) {
  const t = useTranslations("posts");
  const [isHidden, setIsHidden] = useState(false);
  // Supabase Storageから画像URLを生成（WebPサムネイル優先、フォールバック付き）
  const imageUrl = getPostThumbUrl(post);

  // 投稿者情報の表示（Phase 5でプロフィール画面へのリンクを追加予定）
  const displayName =
    post.user?.nickname ||
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    t("anonymousUser");
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
          alt={post.caption || t("postImageAlt")}
          width={800}
          height={800}
          className="w-full h-auto object-contain transition-transform hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
          unoptimized
        />
      ) : (
        <div className="flex aspect-square items-center justify-center text-gray-400">
          {t("noImage")}
        </div>
      )}
    </div>
  );

  return (
    <Card
      className={cn(
        "overflow-hidden pt-0 pb-0 gap-1 transition-[box-shadow,background-color,border-color] duration-700",
        isHighlighted &&
          "border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-300/70 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.65)]"
      )}
    >
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

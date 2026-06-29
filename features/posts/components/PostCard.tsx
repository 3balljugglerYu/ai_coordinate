"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, MessageCircle, User } from "lucide-react";
import { PostCardLikeButton } from "./PostCardLikeButton";
import { getPostThumbUrl } from "../lib/utils";
import type { Post } from "../types";
import type { Locale } from "@/i18n/config";
import { getPostCardHref } from "@/lib/url-utils";
import { PostModerationMenu } from "@/features/moderation/components/PostModerationMenu";
import { cn, formatCountEnUS } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
  isHighlighted?: boolean;
  prioritizeImage?: boolean;
}

export function PostCard({
  post,
  currentUserId,
  isHighlighted = false,
  prioritizeImage = false,
}: PostCardProps) {
  const t = useTranslations("posts");
  const locale = useLocale() as Locale;
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

  if (isHidden) {
    return null;
  }

  const imageContent = (
    // 画像エリアだけ角丸クリップを担う：
    // Card 側の overflow-hidden を外していいねボタンのバースト演出が
    // カード外まで描画できるようにしたため、ホバー時の hover:scale-105 を
    // 画像ラッパーで rounded-t-xl + overflow-hidden に閉じ込める。
    <div className="relative w-full overflow-hidden rounded-t-xl bg-gray-100">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={post.caption || t("postImageAlt")}
          width={800}
          height={800}
          className="w-full h-auto object-contain transition-transform hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
          unoptimized
          priority={prioritizeImage}
          loading={prioritizeImage ? "eager" : undefined}
        />
      ) : (
        <div className="flex aspect-square items-center justify-center text-gray-400">
          {t("noImage")}
        </div>
      )}
      {post.completion_id ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
          {locale === "en" ? "Complete" : "コンプリート"}
        </span>
      ) : null}
    </div>
  );

  // 完走投稿は没入シェアページへ(通常投稿は従来の詳細ページ)。
  const detailHref = getPostCardHref(post, locale);

  return (
    <Card
      // overflow-hidden は付けない：
      // いいねボタンのバースト演出（放射光線・上昇粒子）がカード境界を超えて
      // 描画されるため。画像の角丸クリップは imageContent 側の rounded-t-xl
      // + overflow-hidden が担い、Card 自体は rounded-xl の border-radius と
      // ring/shadow のみで角丸の見た目を維持する。
      className={cn(
        "pt-0 pb-0 gap-1 transition-[box-shadow,background-color,border-color] duration-700",
        isHighlighted &&
          "border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-300/70 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.65)]"
      )}
    >
      <div className="relative">
        {post.id ? (
          // prefetch を有効化して詳細ページへの遷移を高速化する。
          // ロケール付きパス（/ja/posts/xxx 等）を直接指定し、proxy の
          // ロケールリダイレクト 1 ホップを省く。
          //
          // 閲覧数カウントは詳細ページのサーバーレンダーでは行わず
          // （CachedPostDetail は skipViewCount=true）、クライアント側の
          // useEffect → POST /api/posts/[id]/view でのみ加算する。
          // そのため prefetch（= RSC ペイロードの先読みのみ）が走っても
          // 閲覧数は増えない。過去の「閲覧数が異常に増える」不具合は
          // サーバーレンダー中にカウントしていた旧実装が原因であり、
          // 現行構成では prefetch を有効化しても再発しない。
          <Link href={detailHref} prefetch={!post.completion_id}>
            {imageContent}
          </Link>
        ) : (
          imageContent
        )}
        {post.id && (
          // 三点リーダーは Link の外側（兄弟要素）に置く：
          // 中に置くと詳細ページに遷移してしまうため。
          <div className="absolute right-2 top-2 z-10">
            <PostModerationMenu
              postId={post.id}
              authorUserId={post.user_id}
              currentUserId={currentUserId}
              onHidden={() => setIsHidden(true)}
              showShare
              showBlock={false}
            />
          </div>
        )}
      </div>

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

          {/*
           * いいね → コメント → ビューの順で配置。コメント・ビューは 0 のときアイコンのみ。
           * 数字の有無にかかわらずアイコン間に視覚的な余白が入るよう、
           * 3指標だけを内側 flex (gap-2) でまとめる。
           * 親 (gap-1) は Avatar↔DisplayName 用の詰めた間隔のまま。
           */}
          <div className="flex shrink-0 items-center gap-2">
            {post.id && (
              <PostCardLikeButton
                imageId={post.id}
                initialLikeCount={post.like_count || 0}
                currentUserId={currentUserId}
              />
            )}
            {/* 完走投稿のタップ先(没入シェアページ)にはコメントUIが無いため、
                操作不能なコメント数は出さない(MUST-ADDRESS-011)。 */}
            {!post.completion_id && (
              <div className="flex shrink-0 items-center gap-1">
                <MessageCircle className="h-4 w-4 text-gray-500" />
                {(post.comment_count || 0) > 0 && (
                  <span className="text-xs font-medium tabular-nums text-gray-600">
                    {formatCountEnUS(post.comment_count || 0)}
                  </span>
                )}
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <Eye className="h-4 w-4 text-gray-500" />
              {(post.view_count || 0) > 0 && (
                <span className="text-xs font-medium tabular-nums text-gray-600">
                  {formatCountEnUS(post.view_count || 0)}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

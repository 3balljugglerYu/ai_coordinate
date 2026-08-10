"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import { Eye, MessageCircle, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FollowButton } from "@/features/users/components/FollowButton";
import { PostModerationMenu } from "@/features/moderation/components/PostModerationMenu";
import { ImageFullscreen } from "./ImageFullscreen";
import { PostCardLikeButton } from "./PostCardLikeButton";
import { BeforeAfterFrame, FALLBACK_ASPECT_RATIO } from "./BeforeAfterFrame";
import { FeedCaption } from "./FeedCaption";
import { queuePostImpression } from "../lib/impressions-client";
import { formatFeedTimestamp } from "../lib/feed-timestamp";
import { getGenerationModeLabelKey } from "../lib/generation-mode-label";
import {
  getPostBeforeImageUrl,
  getPostDisplayUrl,
  getPostThumbUrl,
  getPublicViewCount,
} from "../lib/utils";
import type { Post } from "../types";
import type { Locale } from "@/i18n/config";
import { getPostCardHref } from "@/lib/url-utils";
import { cn, formatCountEnUS } from "@/lib/utils";
import { isPostImpressionsEnabled } from "@/lib/env";

/** フィードカードの最大幅(PostList 側と揃える)。next/image の sizes に使う。 */
const FEED_CARD_MAX_WIDTH_PX = 600;

interface PostFeedCardProps {
  post: Post;
  currentUserId?: string | null;
  isHighlighted?: boolean;
  prioritizeImage?: boolean;
  trackImpressions?: boolean;
  /**
   * 閲覧者が作者をフォローしているか。未取得は undefined。
   * PostList がバッチで解決した値を渡す(カードごとの問い合わせを避けるため)。
   */
  isFollowingAuthor?: boolean;
  onFollowChange?: (userId: string, isFollowing: boolean) => void;
}

/**
 * フィード表示(1列)用の投稿カード。
 *
 * グリッド用の PostCard とは要素も順序も違うため、拡張せず別に持つ(ADR-001)。
 * グリッドは主要導線であり、条件分岐を増やすと回帰リスクが高い。
 *
 * 並びは 作者 → キャプション → Before/After → 統計。After 1枚では
 * 「プロンプトの効果」と「元のうちの子の魅力」が区別できないため、Before があれば
 * 1:1 で並べてラベルを出す。
 *
 * タップ領域は X に合わせて分ける。
 * - 画像 → 拡大ビュー(詳細へは飛ばさない)
 * - キャプション → 1度目は全文展開、2度目で詳細へ
 * - 統計・作者・メニュー → それぞれの機能
 * - それ以外のカード地 → 詳細へ
 */
export function PostFeedCard({
  post,
  currentUserId,
  isHighlighted = false,
  prioritizeImage = false,
  trackImpressions = false,
  isFollowingAuthor,
  onFollowChange,
}: PostFeedCardProps) {
  const t = useTranslations("posts");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isHidden, setIsHidden] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    post.user?.avatar_url ?? null
  );

  // viewable インプレッション計測。PostCard と同じ作法(可視50%×1秒)に揃える。
  // 表示形式が変わっても「見られた」の定義が変わらないようにするため。
  const impressionsActive = trackImpressions && isPostImpressionsEnabled();
  const { ref: impressionRef, inView: impressionInView } = useInView({
    threshold: 0.5,
    skip: !impressionsActive,
  });
  const postId = post.id;
  useEffect(() => {
    if (!impressionsActive || !impressionInView || !postId) {
      return;
    }
    const timer = window.setTimeout(() => {
      queuePostImpression(postId);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [impressionsActive, impressionInView, postId]);

  const afterUrl = getPostThumbUrl(post);
  const beforeUrl = getPostBeforeImageUrl(post);
  const detailHref = getPostCardHref(post, locale);
  const generationModeLabelKey = getGenerationModeLabelKey(post.generation_type);

  const displayName =
    post.user?.nickname ||
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    t("anonymousUser");

  // 実寸が揃っているときだけ投稿の比率を使う。片方でも欠けたら既定へ倒す。
  const aspectRatio =
    post.width && post.height ? post.width / post.height : FALLBACK_ASPECT_RATIO;

  // 相対時刻は描画時点で決まる。SSR とクライアントで値が変わってハイドレーション
  // 不一致になるため、マウント後に計算する。
  const [timestampLabel, setTimestampLabel] = useState("");
  const postedAt = post.posted_at ?? post.created_at;
  useEffect(() => {
    setTimestampLabel(formatFeedTimestamp(postedAt, locale, Date.now()));
  }, [postedAt, locale]);

  // 拡大ビューは After → Before の順。カードの並びと一致させる。
  const fullscreenImages = useMemo(() => {
    const items: { url: string; alt: string }[] = [];
    if (afterUrl) {
      items.push({ url: getPostDisplayUrl(post) || afterUrl, alt: post.caption || t("postImageAlt") });
    }
    if (beforeUrl) {
      items.push({ url: beforeUrl, alt: t("beforeImageAlt") });
    }
    return items;
  }, [afterUrl, beforeUrl, post, t]);

  const authorId = post.user?.id ?? null;
  // 自分の投稿・未ログイン・フォロー済みにはフォローボタンを出さない。
  const showFollowButton =
    !!authorId && !!currentUserId && authorId !== currentUserId && isFollowingAuthor === false;

  if (isHidden) {
    return null;
  }

  const openDetail = () => router.push(detailHref);

  return (
    <>
      <Card
        className={cn(
          "gap-0 overflow-visible p-0 transition-[box-shadow,background-color,border-color] duration-700",
          isHighlighted &&
            "border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-300/70 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.65)]"
        )}
        data-testid={`post-feed-card-${post.id}`}
      >
        {/* 作者行。名前・アイコン・メニューはそれぞれの導線を持つので、カード地の遷移とは分ける */}
        <div className="flex items-center gap-2 px-3 pt-3">
          {authorId ? (
            <Link
              href={`/users/${encodeURIComponent(authorId)}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 transition-opacity hover:opacity-80"
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={36}
                  height={36}
                  className="h-full w-full rounded-full object-cover"
                  onError={() => setAvatarUrl(null)}
                />
              ) : (
                <User className="h-4 w-4 text-gray-500" />
              )}
            </Link>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200">
              <User className="h-4 w-4 text-gray-500" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {authorId ? (
              <Link
                href={`/users/${encodeURIComponent(authorId)}`}
                className="truncate text-sm font-bold text-gray-900 transition-colors hover:text-gray-600"
                title={displayName}
              >
                {displayName}
              </Link>
            ) : (
              <span className="truncate text-sm font-bold text-gray-900">{displayName}</span>
            )}
            {timestampLabel ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                ・{timestampLabel}
              </span>
            ) : null}
          </div>

          {showFollowButton && authorId ? (
            <div className="shrink-0">
              <FollowButton
                userId={authorId}
                currentUserId={currentUserId}
                onFollowChange={(isFollowing) => onFollowChange?.(authorId, isFollowing)}
              />
            </div>
          ) : null}

          {post.id ? (
            <div className="shrink-0">
              <PostModerationMenu
                postId={post.id}
                authorUserId={post.user_id}
                currentUserId={currentUserId}
                onHidden={() => setIsHidden(true)}
                showShare
                showBlock={false}
              />
            </div>
          ) : null}
        </div>

        {post.caption ? (
          <div className="px-3 pt-2">
            <FeedCaption
              caption={post.caption}
              onOpenDetail={openDetail}
              expandLabel={t("readMore")}
            />
          </div>
        ) : null}

        {/* viewable 判定はカード面積の大半を占める画像エリアで行う(PostCard と同じ) */}
        <div className="relative mt-3 overflow-hidden" ref={impressionRef}>
          <BeforeAfterFrame
            afterUrl={afterUrl}
            beforeUrl={beforeUrl}
            aspectRatio={aspectRatio}
            afterAlt={post.caption || t("postImageAlt")}
            beforeAlt={t("beforeImageAlt")}
            afterLabel={t("afterImageLabel")}
            beforeLabel={t("beforeImageLabel")}
            sizes={`(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`}
            testIdPrefix="post-feed"
            onImageClick={fullscreenImages.length > 0 ? setFullscreenIndex : undefined}
            imageButtonLabel={t("feedExpandImage")}
            priority={prioritizeImage}
          />
          {/* バッジの位置は PostCard と揃える(完走=左上 / 生成モード=左下)。
              AFTER・BEFORE ラベルは右下なので重ならない。 */}
          {post.completion_id ? (
            <span className="absolute left-2 top-2 z-10 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
              {t("completionBadge")}
            </span>
          ) : null}
          {generationModeLabelKey ? (
            <span className="absolute bottom-2 left-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white backdrop-blur-[2px]">
              {t(generationModeLabelKey)}
            </span>
          ) : null}
        </div>

        {/* 統計。カード地(ここより下の余白)を押すと詳細へ移動する */}
        <div className="flex items-center gap-4 px-3 py-2">
          {post.id ? (
            <PostCardLikeButton
              imageId={post.id}
              initialLikeCount={post.like_count || 0}
              currentUserId={currentUserId}
            />
          ) : null}
          <button
            type="button"
            onClick={openDetail}
            aria-label={t("feedComments")}
            className="flex shrink-0 items-center gap-1 text-gray-500 transition-colors hover:text-gray-700"
          >
            <MessageCircle className="h-4 w-4" />
            {(post.comment_count || 0) > 0 ? (
              <span className="text-xs font-medium tabular-nums text-gray-600">
                {formatCountEnUS(post.comment_count || 0)}
              </span>
            ) : null}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Eye className="h-4 w-4 text-gray-500" />
            {getPublicViewCount(post) > 0 ? (
              <span className="text-xs font-medium tabular-nums text-gray-600">
                {formatCountEnUS(getPublicViewCount(post))}
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      {fullscreenIndex !== null ? (
        <ImageFullscreen
          images={fullscreenImages}
          initialIndex={fullscreenIndex}
          isOpen
          onClose={() => setFullscreenIndex(null)}
        />
      ) : null}
    </>
  );
}

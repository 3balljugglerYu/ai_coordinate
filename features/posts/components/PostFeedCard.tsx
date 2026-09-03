"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  BeforeAfterFrame,
  FALLBACK_ASPECT_RATIO,
  isLandscapeRatio,
} from "./BeforeAfterFrame";
import { FeedCaption } from "./FeedCaption";
import { FollowAndUsePromptButton } from "./FollowAndUsePromptButton";
import { FeedSourceQuote } from "./FeedSourceQuote";
import { NewPromptBadge } from "./NewPromptBadge";
import { queuePostImpression } from "../lib/impressions-client";
import { setPendingPostPreview } from "../lib/pending-post-preview";
import { formatFeedTimestamp } from "../lib/feed-timestamp";
import { getGenerationModeLabelKey } from "../lib/generation-mode-label";
import {
  getPostBeforeImageUrl,
  getPostDisplayUrl,
  getPostThumbUrl,
  getPublicViewCount,
} from "../lib/utils";
import type { Post, PromptActionSummary, StylePresetLink } from "../types";
import type { Locale } from "@/i18n/config";
import { getPostCardHref } from "@/lib/url-utils";
import { FEED_CARD_MAX_WIDTH_PX } from "../lib/constants";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import { formatCountEnUS } from "@/lib/utils";
import { isPostImpressionsEnabled } from "@/lib/env";

interface PostFeedCardProps {
  post: Post;
  currentUserId?: string | null;
  prioritizeImage?: boolean;
  trackImpressions?: boolean;
  /**
   * 閲覧者が**投稿者**をフォローしているか。未取得は undefined。
   * PostList がバッチで解決した値を渡す(カードごとの問い合わせを避けるため)。
   * 作者行のフォローボタンの表示に使う。
   */
  isFollowingAuthor?: boolean;
  /**
   * 閲覧者が**原作者**をフォローしているか。未取得は undefined。
   * 派生投稿では投稿者と原作者が別人なので、CTA の判定はこちらを使う。
   */
  isFollowingPromptAuthor?: boolean;
  onFollowChange?: (userId: string, isFollowing: boolean) => void;
  /**
   * 「このプロンプトで作る」を出すためのサマリ（ADR-005）。
   * 未取得・対象外の投稿は undefined。本文は含まない。
   */
  promptAction?: PromptActionSummary;
  /**
   * One-Tap Style 投稿の引用元プリセットへのリンク。
   * 表題とサムネイルは投稿の generation_metadata から読むので、ここは slug だけ。
   */
  stylePresetLink?: StylePresetLink;
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
  prioritizeImage = false,
  trackImpressions = false,
  isFollowingAuthor,
  isFollowingPromptAuthor,
  onFollowChange,
  promptAction,
  stylePresetLink,
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
      queuePostImpression(postId, "feed");
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [impressionsActive, impressionInView, postId]);

  const afterUrl = getPostThumbUrl(post);
  const beforeUrl = getPostBeforeImageUrl(post);
  const detailHref = getPostCardHref(post, locale);
  const generationModeLabelKey = getGenerationModeLabelKey(post.generation_type);
  // One-Tap Style のプリセットは投稿の generation_metadata に入っているため
  // サーバーへ問い合わせずに読める（リンクに要る slug だけ別途もらう）。
  const oneTapPreset = getOneTapStylePresetMetadata(post);

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

  /*
    next/image に渡す sizes。Before/After を横に並べるときは1セルが**半分の幅**に
    なるので、100vw のままだと必要な2倍の解像度を落としてくる。
    横長(上下に積む)と1枚表示のときは全幅のまま。
  */
  const imageSizes = useMemo(() => {
    const showsBefore = !!afterUrl && !!beforeUrl;
    const isHalfWidthCell = showsBefore && !isLandscapeRatio(aspectRatio);
    return isHalfWidthCell
      ? `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 50vw, ${FEED_CARD_MAX_WIDTH_PX / 2}px`
      : `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`;
  }, [afterUrl, beforeUrl, aspectRatio]);

  const authorId = post.user?.id ?? null;
  /*
    インライン関数を渡すと FollowButton の状態取得 effect が毎レンダー走り、
    「取得 → 再レンダー → また取得」の無限ループになる（PostDetail が
    useCallback を使っているのと同じ理由）。
  */
  const handleAuthorFollowChange = useCallback(
    (isFollowing: boolean) => {
      if (authorId) {
        onFollowChange?.(authorId, isFollowing);
      }
    },
    [authorId, onFollowChange]
  );
  // 行動ボタンが「フォローして使う」を出す状態か。
  // このとき作者行のフォローボタンは隠す。同じ相手への導線が2つ並ぶと、
  // どちらを押せばいいのか分からなくなる(投稿詳細の hideFollowButton と同じ考え方)。
  const ctaOffersFollow =
    !!promptAction &&
    promptAction.isAvailable &&
    !!promptAction.originAuthorId &&
    promptAction.originAuthorId === authorId &&
    isFollowingPromptAuthor === false;
  // 自分の投稿・未ログイン・フォロー済みにはフォローボタンを出さない。
  const showFollowButton =
    !!authorId &&
    !!currentUserId &&
    authorId !== currentUserId &&
    isFollowingAuthor === false &&
    !ctaOffersFollow;

  if (isHidden) {
    return null;
  }

  /*
    詳細の <img> はサーバー応答に含まれて届くので、要素が生まれるのは約0.8秒後。
    サムネイルは既にキャッシュにあるのに、それまで描きようがなかった。
    タップした時点で見た目だけ先に渡し、スケルトンに描かせる
    (features/posts/lib/pending-post-preview)。

    **詳細への入口すべてから呼ぶこと。** カード地・コメント・拡大だけでなく、
    時刻リンク(Link なので router.push を通らない)も同じ入口。
    どれか1つ漏らすと、その経路だけ従来どおりグレーの箱に戻る。
  */
  const primePendingPostPreview = () => {
    if (!post.id || !afterUrl) return;
    setPendingPostPreview({
      postId: post.id,
      thumbnailUrl: afterUrl,
      aspectRatio: isLandscapeRatio(aspectRatio) ? "landscape" : "portrait",
    });
  };

  const openDetail = () => {
    primePendingPostPreview();
    router.push(detailHref);
  };
  /** カード地の遷移を止める。自分の役割だけを果たす導線に付ける。 */
  const stopCardNavigation = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <>
      {/*
        カード地のどこを押しても詳細へ行けるようにする(X と同じ)。
        キャプションが無い投稿では、本文をタップして詳細へ、という導線が
        そもそも存在しないため、ここが唯一の受け皿になる。

        個々の導線(作者・画像・キャプション・ボタン)は stopPropagation で
        自分の役割だけを果たす。漏らすと「いいねを押したのに詳細へ飛ぶ」誤爆になる。

        キーボード操作のために role/tabIndex は付けない(カード全体をタブ停止に
        すると中のリンクと二重になる)。代わりに時刻をリンクにして経路を確保する。
      */}
      <Card
        onClick={openDetail}
        className="gap-0 cursor-pointer overflow-visible p-0"
        data-testid={`post-feed-card-${post.id}`}
      >
        {/* 作者行。名前・アイコン・メニューはそれぞれの導線を持つので、カード地の遷移とは分ける */}
        <div className="flex items-center gap-2 px-3 pt-3">
          {authorId ? (
            <Link
              href={`/users/${encodeURIComponent(authorId)}`}
              onClick={stopCardNavigation}
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
                onClick={stopCardNavigation}
                // 指で押しやすいよう縦の当たり判定を広げる(文字高だけだと細い)
                className="-my-1 truncate py-1 text-sm font-bold text-gray-900 transition-colors hover:text-gray-600"
                title={displayName}
              >
                {displayName}
              </Link>
            ) : (
              <span className="truncate text-sm font-bold text-gray-900">{displayName}</span>
            )}
            {timestampLabel ? (
              // X と同じく時刻から詳細へ。カード地タップは目に見えないので、
              // 押せると分かる入口をひとつ残す(キーボード操作の経路も兼ねる)。
              <Link
                href={detailHref}
                onClick={(event) => {
                  // カード地の遷移は止めつつ、先渡しはこの経路でも行う
                  stopCardNavigation(event);
                  primePendingPostPreview();
                }}
                className="-my-1 shrink-0 py-1 text-xs text-muted-foreground transition-colors hover:text-gray-700"
                data-testid="post-feed-card-timestamp"
              >
                ・{timestampLabel}
              </Link>
            ) : null}
          </div>

          {showFollowButton && authorId ? (
            <div className="shrink-0" onClick={stopCardNavigation}>
              <FollowButton
                userId={authorId}
                currentUserId={currentUserId}
                // PostList がバッチで解決済み。ボタンごとに問い合わせ直さない
                initialIsFollowing={isFollowingAuthor}
                onFollowChange={handleAuthorFollowChange}
              />
            </div>
          ) : null}

          {post.id ? (
            <div className="shrink-0" onClick={stopCardNavigation}>
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
          <div className="px-3 pt-2" onClick={stopCardNavigation}>
            <FeedCaption
              caption={post.caption}
              onOpenDetail={openDetail}
              expandLabel={t("readMore")}
            />
          </div>
        ) : (
          /*
            キャプションが無い投稿は、作者行と画像が詰まって窮屈に見える。
            1行ぶんの余白を空けて見た目を整えつつ、ここが詳細への
            タップ領域にもなる(カード地の onClick がそのまま効く)。
          */
          <div className="h-5" data-testid="post-feed-card-caption-spacer" />
        )}

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
            sizes={imageSizes}
            testIdPrefix="post-feed"
            onImageClick={fullscreenImages.length > 0 ? setFullscreenIndex : undefined}
            imageButtonLabel={t("feedExpandImage")}
            priority={prioritizeImage}
            clampPortraitToWidth
          />
          {/* バッジの位置は PostCard と揃える(完走・🆕=左上 / 生成モード=左下)。
              AFTER・BEFORE ラベルは右下なので重ならない。
              左上は横並びの器にして、完走と 🆕 が同時に立っても重ならないようにする
              (現データでは同時に立たないが、片方を握りつぶす作りにはしない)。 */}
          {post.completion_id || post.isNew ? (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
              {post.completion_id ? (
                <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                  {t("completionBadge")}
                </span>
              ) : null}
              {post.isNew ? <NewPromptBadge /> : null}
            </div>
          ) : null}
          {generationModeLabelKey ? (
            <span className="absolute bottom-2 left-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white backdrop-blur-[2px]">
              {t(generationModeLabelKey)}
            </span>
          ) : null}
        </div>

        {/*
          引用元ブロック（X の引用リポスト相当）。
          「誰の何を使ったか」→「自分も作る」が一続きに読めるよう、行動ボタンは
          この中に入れる。同じ場所にブロックが2つ並ぶのを避ける意味もある。
        */}
        {promptAction?.isAvailable ? (
          <div className="px-3 pt-3" onClick={stopCardNavigation}>
            <FeedSourceQuote
              /*
                原作がこの投稿自身なら引用ではなくお知らせ。サムネイルと作者名を
                出すと、すぐ上の投稿本体と同じものを繰り返すだけになる。
              */
              variant={promptAction.originPostId === post.id ? "root" : "derived"}
              thumbnailUrl={promptAction.originThumbnailUrl}
              title={promptAction.originAuthorNickname || t("anonymousUser")}
              avatarUrl={promptAction.originAuthorAvatarUrl}
              description={promptAction.originCaption}
              href={
                promptAction.originPostId === post.id
                  ? null
                  : `/posts/${encodeURIComponent(promptAction.originPostId)}`
              }
              usageCount={promptAction.usageCount}
              action={
                <FollowAndUsePromptButton
                  summary={promptAction}
                  currentUserId={currentUserId ?? null}
                  isFollowingAuthor={isFollowingPromptAuthor}
                  onFollowChange={onFollowChange}
                />
              }
            />
          </div>
        ) : oneTapPreset ? (
          <div className="px-3 pt-3" onClick={stopCardNavigation}>
            <FeedSourceQuote
              variant="style"
              thumbnailUrl={oneTapPreset.thumbnailImageUrl}
              title={oneTapPreset.title}
              href={
                stylePresetLink?.slug
                  ? `/styles/${encodeURIComponent(stylePresetLink.slug)}`
                  : null
              }
              usageCount={stylePresetLink?.usageCount ?? 0}
              isEnded={stylePresetLink?.isEnded ?? false}
            />
          </div>
        ) : null}

        {/* 統計。カード地(ここより下の余白)を押すと詳細へ移動する */}
        <div className="flex items-center gap-4 px-3 py-2">
          {post.id ? (
            <span onClick={stopCardNavigation}>
              <PostCardLikeButton
                imageId={post.id}
                initialLikeCount={post.like_count || 0}
                currentUserId={currentUserId}
              />
            </span>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              // 親カードにも onClick があるため、止めないと同じ詳細へ2回 push され
              // 履歴が重複する(戻っても同じ画面に留まる)
              stopCardNavigation(event);
              openDetail();
            }}
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

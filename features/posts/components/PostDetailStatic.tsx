"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { PostDetailStatsContent } from "./PostDetailStatsContent";
import { PostDetailStatsSkeleton } from "./PostDetailStatsSkeleton";
import Image from "next/image";
import Link from "next/link";
import { User, MoreHorizontal, Edit, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CollapsibleText } from "./CollapsibleText";
import { EditPostModal } from "./EditPostModal";
import { DeletePostDialog } from "./DeletePostDialog";
import { PostModal } from "./PostModal";
import { PostMetaLine } from "./PostMetaLine";
import { getPostImageUrl, getPostBeforeImageUrl } from "../lib/utils";
import { copyTextToClipboard } from "../lib/copy-to-clipboard";
import { useToast } from "@/components/ui/use-toast";
import { FollowButton } from "@/features/users/components/FollowButton";
import { PostModerationMenu } from "@/features/moderation/components/PostModerationMenu";
import { OneTapStyleDetailCard } from "@/features/style/components/OneTapStyleDetailCard";
import { getVisiblePrompt } from "@/features/generation/lib/prompt-visibility";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import { SubscriptionBadge } from "@/features/subscription/components/SubscriptionBadge";
import type { Post } from "../types";

// ImageFullscreenコンポーネントを動的インポート（SSR不要）
const ImageFullscreen = lazy(() => import("./ImageFullscreen").then(module => ({ default: module.ImageFullscreen })));

interface PostDetailStaticProps {
  post: Post;
  currentUserId?: string | null;
  imageAspectRatio: "portrait" | "landscape" | null;
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  ownerId?: string | null;
  imageUrl?: string | null;
  isHidden?: boolean;
  onHidden?: () => void;
}

/**
 * 投稿詳細画面の静的コンテンツコンポーネント
 * 画像、ユーザー情報、キャプション、プロンプトなど、変更頻度の低いコンテンツ
 */
export function PostDetailStatic({
  post,
  currentUserId,
  imageAspectRatio,
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  ownerId,
  imageUrl,
  isHidden = false,
  onHidden,
}: PostDetailStaticProps) {
  const postsT = useTranslations("posts");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const { toast } = useToast();

  // imageUrlはpropsから取得（重複定義を避けるため）
  const displayImageUrl = imageUrl || getPostImageUrl(post) || undefined;
  // Before（生成元）画像。生成完了時に worker がバックグラウンドで永続化する。
  // 永続化完了までの間は image_jobs.input_image_url を使った楽観表示でつなぐ
  // （getPostBeforeImageUrl が永続パス→fallback→null の順で解決）。
  const beforeImageUrl = getPostBeforeImageUrl(post);
  const displayName =
    post.user?.nickname ||
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    postsT("anonymousUser");
  const isOwner = currentUserId === post.user_id;
  const followUserId = post.user?.id || post.user_id;
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const canViewPrompt = isOwner || isFollowingAuthor;
  const oneTapStylePreset = getOneTapStylePresetMetadata(post);
  const visiblePrompt = getVisiblePrompt(post);
  const hasVisiblePrompt = visiblePrompt.trim().length > 0;

  const handleCopyPrompt = async () => {
    if (!canViewPrompt || !hasVisiblePrompt) {
      toast({
        title: postsT("followRequiredTitle"),
        description: postsT("followRequiredDescription"),
      });
      return;
    }
    if (hasVisiblePrompt) {
      try {
        await copyTextToClipboard(visiblePrompt);
        setIsPromptCopied(true);
        toast({
          title: postsT("copySuccessTitle"),
          description: postsT("copySuccessDescription"),
        });
        setTimeout(() => setIsPromptCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        toast({
          title: postsT("copyFailureTitle"),
          description: postsT("copyFailureDescription"),
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => {
    const fetchFollowStatus = async () => {
      if (!currentUserId || !followUserId || isOwner) {
        setIsFollowingAuthor(isOwner);
        return;
      }
      try {
        const res = await fetch(`/api/users/${followUserId}/follow-status`);
        if (!res.ok) {
          setIsFollowingAuthor(false);
          return;
        }
        const data = await res.json();
        setIsFollowingAuthor(Boolean(data.isFollowing));
      } catch (error) {
        console.error("Failed to fetch follow status:", error);
        setIsFollowingAuthor(false);
      }
    };
    fetchFollowStatus();
  }, [currentUserId, followUserId, isOwner]);

  const maskedPrompt = hasVisiblePrompt ? "*".repeat(visiblePrompt.length) : "";

  if (isHidden) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-muted-foreground">
          {postsT("hiddenMessage")}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="container mx-auto max-w-4xl bg-white">
        {/* 画像セクション */}
        <div className="relative w-full overflow-hidden bg-white">
          {beforeImageUrl && (
            <div className="relative w-full overflow-hidden bg-white">
              <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                {postsT("beforeImageLabel")}
              </div>
              <div
                className={`relative w-full overflow-hidden bg-white ${
                  imageAspectRatio === "portrait"
                    ? "max-h-[50vh]"
                    : imageAspectRatio === "landscape"
                    ? "max-h-[50vh]"
                    : "aspect-square"
                }`}
              >
                <Image
                  src={beforeImageUrl}
                  alt={postsT("beforeImageAlt")}
                  width={1200}
                  height={1200}
                  className={`w-full h-auto object-contain ${
                    imageAspectRatio === "portrait" || imageAspectRatio === "landscape"
                      ? "max-h-[50vh]"
                      : ""
                  }`}
                  sizes="(max-width: 768px) 100vw, 80vw"
                />
              </div>
            </div>
          )}

          {beforeImageUrl && (
            <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              {postsT("afterImageLabel")}
            </div>
          )}

          <div
            className={`relative w-full overflow-hidden bg-white cursor-pointer ${
              imageAspectRatio === "portrait"
                ? "max-h-[50vh]"
                : imageAspectRatio === "landscape"
                ? "max-h-[50vh]"
                : "aspect-square"
            }`}
            onClick={() => setIsFullscreenOpen(true)}
          >
            {displayImageUrl ? (
              <Image
                src={displayImageUrl}
                alt={
                  beforeImageUrl
                    ? postsT("afterImageAlt")
                    : post.caption || postsT("postImageAlt")
                }
                width={1200}
                height={1200}
                className={`w-full h-auto object-contain ${
                  imageAspectRatio === "portrait" || imageAspectRatio === "landscape"
                    ? "max-h-[50vh]"
                    : ""
                }`}
                sizes="(max-width: 768px) 100vw, 80vw"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {postsT("noImage")}
              </div>
            )}
          </div>
        </div>

        {/* ユーザー情報セクション */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          {/* 1行目: ユーザーアイコン、ニックネーム、フォローボタン、3点リーダー */}
          <div className="flex items-center gap-3">
            {/* ユーザーアイコン */}
            {post.user?.id ? (
              <Link
                href={`/users/${post.user.id}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 hover:opacity-80 transition-opacity"
              >
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
              </Link>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200">
                <User className="h-5 w-5 text-gray-500" />
              </div>
            )}

            {/* ニックネーム */}
            <div className="min-w-0 flex-1">
              {post.user?.id ? (
                <Link
                  href={`/users/${post.user.id}`}
                  className="flex items-center gap-2 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
                >
                  <span className="truncate">{displayName}</span>
                  <SubscriptionBadge plan={post.user.subscription_plan} />
                </Link>
              ) : (
                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <span className="truncate">{displayName}</span>
                  <SubscriptionBadge plan={post.user?.subscription_plan} />
                </span>
              )}
            </div>

            {/* フォローボタン（自分の投稿の場合は表示しない） */}
            {!isOwner && followUserId && (
              <FollowButton
                userId={followUserId}
                currentUserId={currentUserId}
                onFollowChange={setIsFollowingAuthor}
              />
            )}

            {/* 3点リーダー（所有者の場合） */}
            {isOwner ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!post.is_posted ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {postsT("delete")}
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {postsT("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {postsT("unpost")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              post.id && (
                <PostModerationMenu
                  postId={post.id}
                  authorUserId={followUserId}
                  currentUserId={currentUserId}
                  onHidden={onHidden}
                />
              )
            )}
          </div>

          {/* 2行目: いいね、コメント、ビュー（動的コンテンツのスロット） */}
          <div className="mt-2">
            <Suspense fallback={<PostDetailStatsSkeleton />}>
              <PostDetailStatsContent
                postId={postId}
                initialLikeCount={initialLikeCount}
                initialCommentCount={initialCommentCount}
                initialViewCount={initialViewCount}
                currentUserId={currentUserId}
                ownerId={ownerId}
                isPosted={post.is_posted || false}
                caption={post.caption}
                imageUrl={imageUrl}
                onPostClick={!post.is_posted ? () => setPostModalOpen(true) : undefined}
              />
            </Suspense>
          </div>
        </div>

        {/* キャプション */}
        {post.caption && (
          <div className="bg-white px-4 py-3">
            <CollapsibleText text={post.caption} maxLines={3} />
          </div>
        )}

        {/* 生成モデル / サイズ（プロンプト直前） */}
        <PostMetaLine
          model={post.model ?? null}
          width={post.width ?? null}
          height={post.height ?? null}
        />

        {/* プロンプト */}
        {oneTapStylePreset ? (
          <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-2">
            <OneTapStyleDetailCard preset={oneTapStylePreset} />
          </div>
        ) : hasVisiblePrompt ? (
          <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-700">
                {postsT("prompt")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyPrompt}
                  className="h-7 px-2 text-xs"
                >
                  {isPromptCopied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      {postsT("copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      {postsT("copy")}
                    </>
                  )}
                </Button>
              </div>
            </div>
            <CollapsibleText text={canViewPrompt ? visiblePrompt : maskedPrompt} maxLines={1} />
          </div>
        ) : null}
      </div>

      {/* 全画面表示 */}
      {displayImageUrl && (
        <Suspense fallback={null}>
          <ImageFullscreen
            imageUrl={displayImageUrl}
            alt={post.caption || postsT("postImageAlt")}
            isOpen={isFullscreenOpen}
            onClose={() => setIsFullscreenOpen(false)}
          />
        </Suspense>
      )}

      {/* 編集モーダル */}
      {post.id && (
        <EditPostModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          imageId={post.id}
          currentCaption={post.caption}
        />
      )}

      {/* 削除ダイアログ */}
      {post.id && (
        <DeletePostDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          imageId={post.id}
          imageUrl={displayImageUrl}
          isPosted={post.is_posted}
        />
      )}

      {/* 投稿モーダル（未投稿画像の場合） */}
      {post.id && !post.is_posted && (
        <PostModal
          open={postModalOpen}
          onOpenChange={setPostModalOpen}
          imageId={post.id}
          currentCaption={post.caption || undefined}
        />
      )}
    </div>
  );
}

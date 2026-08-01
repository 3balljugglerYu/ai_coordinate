"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { User, Heart, Copy, Check, MoreHorizontal, Edit, Trash2, Share2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageFullscreen } from "./ImageFullscreen";
import { CollapsibleText } from "./CollapsibleText";
import { EditPostModal } from "./EditPostModal";
import { DeletePostDialog } from "./DeletePostDialog";
import { PostModal } from "./PostModal";
import { PostActions } from "./PostActions";
import { CommentInput } from "./CommentInput";
import { CommentList, type CommentListRef } from "./CommentList";
import { PostMetaLine } from "./PostMetaLine";
import { getPostImageUrl, getPostBeforeImageUrl, getPublicViewCount } from "../lib/utils";
import { copyTextToClipboard } from "../lib/copy-to-clipboard";
import { useToast } from "@/components/ui/use-toast";
import { FollowButton } from "@/features/users/components/FollowButton";
import { OneTapStyleDetailCard } from "@/features/style/components/OneTapStyleDetailCard";
import {
  getPostPromptDisplayMode,
  getVisiblePrompt,
  shouldShowPromptWithCard,
} from "@/features/generation/lib/prompt-visibility";
import { SourcePromptReferenceCard } from "./SourcePromptReferenceCard";
import { fetchSourcePromptText } from "../lib/source-prompt-text-api";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { Post } from "../types";

interface PostDetailProps {
  post: Post;
  currentUserId?: string | null;
  /**
   * 閲覧者の購読プラン。派生生成シートのモデル選択・上限に使う。
   * 投稿者のプランではないので post.user.subscription_plan とは別物。
   */
  viewerSubscriptionPlan?: SubscriptionPlan;
}

/**
 * 投稿詳細画面のメインコンポーネント
 */
export function PostDetail({
  post,
  currentUserId,
  viewerSubscriptionPlan = "free",
}: PostDetailProps) {
  const t = useTranslations("posts");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<"portrait" | "landscape" | null>(null);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const { toast } = useToast();
  const commentListRef = useRef<CommentListRef>(null);

  const imageUrl = getPostImageUrl(post);
  const beforeImageUrl = getPostBeforeImageUrl(post);

  // 画像の縦横比を判定
  useEffect(() => {
    if (!imageUrl) return;
    
    const img = new window.Image();
    img.src = imageUrl;
    
    const checkAspectRatio = () => {
      if (img.naturalWidth && img.naturalHeight) {
        const aspectRatio = img.naturalHeight / img.naturalWidth;
        setImageAspectRatio(aspectRatio > 1 ? "portrait" : "landscape");
      }
    };

    if (img.complete) {
      checkAspectRatio();
    } else {
      img.onload = checkAspectRatio;
      img.onerror = () => {
        // 画像の読み込みに失敗した場合はデフォルトのアスペクト比を使用
        setImageAspectRatio(null);
      };
    }
  }, [imageUrl]);

  // 投稿者情報の表示
  const displayName =
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    t("anonymousUser");

  const followUserId = post.user?.id || post.user_id;
  const isOwner = currentUserId === post.user_id;
  const canViewPrompt = isOwner || isFollowingAuthor;
  const oneTapStylePreset = getOneTapStylePresetMetadata(post);
  const visiblePrompt = getVisiblePrompt(post);
  const hasVisiblePrompt = visiblePrompt.trim().length > 0;
  // 表示モードは1箇所で決める（REQ-013）
  const promptDisplayMode = getPostPromptDisplayMode(post, { isOwner });
  // /free の投稿で、本人または公開プロンプトのときはカードと本文を並べる
  const showsCardWithPrompt = shouldShowPromptWithCard(post, { isOwner });
  /*
    本人以外の本文は payload に載せていない（未フォロワーのブラウザへ届かせない
    ため）。公開プロンプトを併記するときだけ、サーバー側で認可する
    /api/posts/[id]/prompt-text から取りに行く。

    未フォロワーには 404 が返るので本文は出ない。カード側が
    「フォローすると使えます」と次の行動を示すので、伏字を並べる必要はない。
  */
  const [fetchedPromptText, setFetchedPromptText] = useState<string | null>(
    null
  );
  // 参照カードのフォロー判定の対象は原作者。派生投稿では投稿者と別人になる（ADR-003）。
  const sourceAuthorId = post.source_reference?.authorId ?? null;
  const isSourceAuthorSelf =
    !!currentUserId && !!sourceAuthorId && currentUserId === sourceAuthorId;
  /*
    フォロー済みと確認できた原作者の ID を持つ。boolean ではなく ID を持つのは、
    別の投稿へ移って原作者が変わったときに前の判定が残らないようにするため。
  */
  const [followedSourceAuthorId, setFollowedSourceAuthorId] = useState<
    string | null
  >(null);
  const isFollowingSourceAuthor =
    isSourceAuthorSelf ||
    (!!sourceAuthorId && followedSourceAuthorId === sourceAuthorId);

  // プロンプトのコピー機能
  const handleCopyPrompt = async () => {
    if (!canViewPrompt || !hasVisiblePrompt) {
      toast({
        title: t("followRequiredTitle"),
        description: t("followRequiredDescription"),
      });
      return;
    }
    if (hasVisiblePrompt) {
      try {
        await copyTextToClipboard(displayPrompt);
        setIsPromptCopied(true);
        toast({
          title: t("copySuccessTitle"),
          description: t("copySuccessDescription"),
        });
        setTimeout(() => setIsPromptCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        toast({
          title: t("copyFailureTitle"),
          description: t("copyFailureDescription"),
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

  /**
   * 参照カード用のフォロー判定。対象は原作者で、投稿者とは別人になり得る。
   *
   * サーバーの payload に載せずクライアントで取るのは、投稿詳細が
   * `use cache` (cacheLife("minutes")) を通るためである。フォローした直後に
   * カードが有効化されないと操作の手応えを失う。押せてしまった場合でも
   * 生成API・Worker・完了RPCが再検証するので、権限が緩む方向には倒れない。
   *
   * effect 内で同期的に setState しない。自分が原作者・原作者不明・未ログインは
   * 派生値で表現できるため、ここでは fetch 結果だけを state へ入れる。
   */
  useEffect(() => {
    if (!sourceAuthorId || !currentUserId || isSourceAuthorSelf) {
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${sourceAuthorId}/follow-status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setFollowedSourceAuthorId(data?.isFollowing ? sourceAuthorId : null);
      })
      .catch((error) => {
        console.error("Failed to fetch source author follow status:", error);
        if (!cancelled) setFollowedSourceAuthorId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, sourceAuthorId, isSourceAuthorSelf]);

  useEffect(() => {
    if (!showsCardWithPrompt || isOwner || !post.id) {
      return;
    }
    // payload に本文があるならそれで足りる
    if (visiblePrompt.trim().length > 0) {
      return;
    }
    let cancelled = false;
    fetchSourcePromptText(post.id)
      .then((text) => {
        if (!cancelled) setFetchedPromptText(text);
      })
      .catch(() => {
        if (!cancelled) setFetchedPromptText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showsCardWithPrompt, isOwner, post.id, visiblePrompt]);

  const maskedPrompt = hasVisiblePrompt ? "*".repeat(visiblePrompt.length) : "";
  /*
    表示する本文。

    /free（カード併記）: 本人は payload、フォロワーは API から取った値。
    未フォロワーは取得できないので空になり、本文ブロックごと出ない。
    カード側が「フォローすると使えます」と次の行動を示すため、伏字は要らない。

    それ以外（coordinate 等）: 従来どおり、閲覧不可なら伏字を出す。
    カードが無くゲートの理由を示す場所が他に無いため、伏字が
    「本文はあるが今は見られない」ことを伝える役目を持つ。
  */
  const displayPrompt = showsCardWithPrompt
    ? hasVisiblePrompt
      ? visiblePrompt
      : fetchedPromptText ?? ""
    : canViewPrompt
      ? visiblePrompt
      : maskedPrompt;
  const hasDisplayPrompt = displayPrompt.trim().length > 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto bg-white">
        {/* 画像セクション */}
        <div className="relative w-full overflow-hidden bg-white">
          <div
            className={`relative w-full overflow-hidden bg-white ${
              imageAspectRatio === "portrait"
                ? "max-h-[50vh]"
                : imageAspectRatio === "landscape"
                ? "w-full"
                : "aspect-square"
            }`}
            onClick={() => setIsFullscreenOpen(true)}
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={post.caption || t("postImageAlt")}
                width={1200}
                height={1200}
                className={`w-full h-auto object-contain cursor-pointer ${
                  imageAspectRatio === "portrait" ? "max-h-[50vh]" : ""
                }`}
                sizes="(max-width: 768px) 100vw, 80vw"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {t("noImage")}
              </div>
            )}
          </div>
        </div>

        {/* ユーザー情報セクション */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          {/* 1行目: ユーザーアイコン、ニックネーム、フォローボタン、3点リーダー */}
          <div className="flex items-center gap-3 mb-2">
            {/* ユーザーアイコン */}
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

            {/* ニックネーム */}
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">
                {displayName}
              </span>
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
            {isOwner && (
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
                      <DropdownMenuItem onClick={() => setPostModalOpen(true)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        {t("postSubmit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        削除
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("unpost")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* 2行目: いいね、コメント、ビュー（画面の左端から） */}
          <div>
            <PostActions
              postId={post.id || ""}
              initialLikeCount={post.like_count || 0}
              initialCommentCount={commentCount}
              initialViewCount={getPublicViewCount(post)}
              currentUserId={currentUserId}
              ownerId={post.user_id}
              isPosted={post.is_posted}
              caption={post.caption}
              imageUrl={imageUrl}
            />
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

        {/*
          プロンプト欄。表示モードは getPostPromptDisplayMode の4分岐に従う。
          分岐条件をここに散らすと、非公開の投稿に本文が出る事故が起きる。
        */}
        {promptDisplayMode === "one_tap_style" ? (
          <div className="border-t border-gray-200 bg-white px-4 py-3">
            <OneTapStyleDetailCard preset={oneTapStylePreset!} />
          </div>
        ) : promptDisplayMode === "source_reference" && post.source_reference ? (
          <div className="border-t border-gray-200 bg-white px-4 py-3">
            <SourcePromptReferenceCard
              reference={post.source_reference}
              currentUserId={currentUserId ?? null}
              isFollowingAuthor={isFollowingSourceAuthor}
              isDerivedPost={!!post.source_post_id}
              subscriptionPlan={viewerSubscriptionPlan}
            />
          </div>
        ) : promptDisplayMode === "prompt" ? (
          <div className="border-t border-gray-200 bg-white px-4 py-3">
            {/* カードを本文の上へ。利用数と「このプロンプトで作る」はカード側にある */}
            {showsCardWithPrompt && post.source_reference ? (
              <div className="mb-3">
                <SourcePromptReferenceCard
                  reference={post.source_reference}
                  currentUserId={currentUserId ?? null}
                  isFollowingAuthor={isFollowingSourceAuthor}
                  isDerivedPost={!!post.source_post_id}
                  subscriptionPlan={viewerSubscriptionPlan}
                />
              </div>
            ) : null}

            {hasDisplayPrompt ? (
            <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                {t("prompt")}
                {post.prompt_visibility === "private" ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                    {t("promptPrivateBadge")}
                  </span>
                ) : null}
              </span>
              {/*
                コピーは /free ではカード側の「プロンプトをコピーする」に寄せた。
                本人の画面ではカードと本文が並ぶので、ここにも置くと二重になる。
                coordinate は従来どおりここにコピーを残す。
              */}
              <div className="flex items-center gap-2">
                {showsCardWithPrompt ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyPrompt}
                  className="h-7 px-2 text-xs"
                >
                  {isPromptCopied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      {t("copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      {t("copy")}
                    </>
                  )}
                </Button>
                )}
              </div>
            </div>
            <CollapsibleText text={displayPrompt} maxLines={1} />
            </>
            ) : null}
          </div>
        ) : null}

        {/* コメントセクション */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mb-4">
            <CommentInput
              imageId={post.id || ""}
              onCommentAdded={() => {
                // コメントが追加されたら、CommentListをリフレッシュ
                commentListRef.current?.refresh();
                // コメント数をインクリメント
                setCommentCount((prev) => prev + 1);
              }}
              currentUserId={currentUserId}
            />
          </div>
          <CommentList
            ref={commentListRef}
            imageId={post.id || ""}
            currentUserId={currentUserId}
            onCommentAdded={() => {
              // コメントが削除された場合にコメント数をデクリメント
              setCommentCount((prev) => Math.max(0, prev - 1));
            }}
          />
        </div>
      </div>

      {/* 全画面表示 */}
      {imageUrl && (
        <ImageFullscreen
          imageUrl={imageUrl}
          alt={post.caption || t("postImageAlt")}
          isOpen={isFullscreenOpen}
          onClose={() => setIsFullscreenOpen(false)}
        />
      )}

      {/* 編集モーダル */}
      {post.id && (
        <EditPostModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          imageId={post.id}
          currentCaption={post.caption}
          currentShowBeforeImage={post.show_before_image}
          afterImageUrl={imageUrl}
          beforeImageUrl={beforeImageUrl}
          generationType={post.generation_type ?? null}
          sourcePostId={post.source_post_id ?? null}
          currentPromptVisibility={post.prompt_visibility}
        />
      )}

      {/* 削除ダイアログ */}
      {post.id && (
        <DeletePostDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          imageId={post.id}
          imageUrl={imageUrl}
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
          afterImageUrl={imageUrl}
          beforeImageUrl={beforeImageUrl}
          generationType={post.generation_type ?? null}
          sourcePostId={post.source_post_id ?? null}
        />
      )}
    </div>
  );
}

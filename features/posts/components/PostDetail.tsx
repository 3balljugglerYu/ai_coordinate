"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { User, Heart, Copy, Check, MoreHorizontal, Edit, Trash2, Share2 } from "lucide-react";
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
import { LikeButton } from "./LikeButton";
import { CommentInput } from "./CommentInput";
import { CommentList, type CommentListRef } from "./CommentList";
import { getPostImageUrl } from "../lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { FollowButton } from "@/features/users/components/FollowButton";
import type { Post } from "../types";

interface PostDetailProps {
  post: Post;
  currentUserId?: string | null;
}

/**
 * 投稿詳細画面のメインコンポーネント
 */
export function PostDetail({ post, currentUserId }: PostDetailProps) {
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
    "匿名ユーザー";

  const followUserId = post.user?.id || post.user_id;
  const isOwner = currentUserId === post.user_id;
  const canViewPrompt = isOwner || isFollowingAuthor;

  // プロンプトのコピー機能
  const handleCopyPrompt = async () => {
    if (!canViewPrompt || !post.prompt) {
      toast({
        title: "フォローが必要です",
        description: "『フォロー』することでコピーできるようになります。",
      });
      return;
    }
    if (post.prompt) {
      try {
        await navigator.clipboard.writeText(post.prompt);
        setIsPromptCopied(true);
        toast({
          title: "コピーしました",
          description: "プロンプトをクリップボードにコピーしました",
        });
        setTimeout(() => setIsPromptCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        toast({
          title: "コピーに失敗しました",
          description: "もう一度お試しください",
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

  const maskedPrompt = post.prompt ? "*".repeat(post.prompt.length) : "";

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
                alt={post.caption || "投稿画像"}
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
                画像がありません
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
                        投稿する
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
                        編集
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        投稿を取り消す
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* 2行目: いいね、コメント、ビュー（画面の左端から） */}
          <div>
            <LikeButton
              imageId={post.id || ""}
              initialLikeCount={post.like_count || 0}
              initialCommentCount={commentCount}
              initialViewCount={post.view_count || 0}
              currentUserId={currentUserId}
            />
          </div>
        </div>

        {/* キャプション */}
        {post.caption && (
          <div className="bg-white px-4 py-3">
            <CollapsibleText text={post.caption} maxLines={3} />
          </div>
        )}


        {/* プロンプト */}
        {post.prompt && (
          <div className="border-t border-gray-200 bg-white px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-700">プロンプト</span>
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
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      コピー
                    </>
                  )}
                </Button>
              </div>
            </div>
            <CollapsibleText text={canViewPrompt ? post.prompt : maskedPrompt} maxLines={1} />
          </div>
        )}

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
          alt={post.caption || "投稿画像"}
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
        />
      )}
    </div>
  );
}

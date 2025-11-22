"use client";

import { useState, useEffect } from "react";
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
import { getPostImageUrl } from "../lib/utils";
import { useToast } from "@/components/ui/use-toast";
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
  const { toast } = useToast();

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

  // プロンプトのコピー機能
  const handleCopyPrompt = async () => {
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

  const isOwner = currentUserId === post.user_id;

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
          <div className="flex items-center gap-3">
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

            {/* フォローボタン */}
            <Button
              variant="outline"
              size="sm"
              disabled
              className="text-xs"
            >
              フォロー
            </Button>

            {/* いいねボタンといいね数 */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled
                className="h-8 w-8 p-0"
              >
                <Heart className="h-5 w-5 text-gray-400" />
              </Button>
              <span className="text-sm text-gray-600">
                {post.like_count ?? 0}
              </span>
            </div>

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
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">
                  プロンプト
                </span>
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
            <CollapsibleText text={post.prompt} maxLines={1} />
          </div>
        )}

        {/* コメントセクション（プレースホルダー） */}
        <div className="border-t border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            コメント機能はPhase 4で実装予定です
          </p>
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


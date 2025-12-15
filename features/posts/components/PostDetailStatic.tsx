"use client";

import { useState, lazy, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { User, MoreHorizontal, Edit, Trash2, Share2, Copy, Check } from "lucide-react";
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
import { getPostImageUrl } from "../lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { FollowButton } from "@/features/users/components/FollowButton";
import type { Post } from "../types";

// ImageFullscreenコンポーネントを動的インポート（SSR不要）
const ImageFullscreen = lazy(() => import("./ImageFullscreen").then(module => ({ default: module.ImageFullscreen })));

interface PostDetailStaticProps {
  post: Post;
  currentUserId?: string | null;
  imageAspectRatio: "portrait" | "landscape" | null;
  children?: React.ReactNode;
}

/**
 * 投稿詳細画面の静的コンテンツコンポーネント
 * 画像、ユーザー情報、キャプション、プロンプトなど、変更頻度の低いコンテンツ
 */
export function PostDetailStatic({
  post,
  currentUserId,
  imageAspectRatio,
  children,
}: PostDetailStaticProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const { toast } = useToast();

  const imageUrl = getPostImageUrl(post);
  const displayName =
    post.user?.nickname ||
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    "匿名ユーザー";
  const isOwner = currentUserId === post.user_id;
  const followUserId = post.user?.id || post.user_id;

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

  return (
    <div className="bg-white">
      <div className="container mx-auto max-w-4xl bg-white">
        {/* 画像セクション */}
        <div className="relative w-full overflow-hidden bg-white">
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
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={post.caption || "投稿画像"}
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
                画像がありません
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
                  className="block truncate text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
                >
                  {displayName}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium text-gray-900">
                  {displayName}
                </span>
              )}
            </div>

            {/* フォローボタン（自分の投稿の場合は表示しない） */}
            {!isOwner && followUserId && (
              <FollowButton userId={followUserId} currentUserId={currentUserId} />
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

          {/* 2行目: いいね、コメント、ビュー（動的コンテンツのスロット） */}
          <div className="mt-2">
            {children}
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
          <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-2">
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
      </div>

      {/* 全画面表示 */}
      {imageUrl && (
        <Suspense fallback={null}>
          <ImageFullscreen
            imageUrl={imageUrl}
            alt={post.caption || "投稿画像"}
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

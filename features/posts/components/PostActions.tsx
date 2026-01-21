"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";
import { DownloadButton } from "./DownloadButton";
import { ViewCount } from "./ViewCount";
import { CommentCount } from "./CommentCount";

interface PostActionsProps {
  postId: string;
  initialLikeCount: number;
  initialCommentCount?: number;
  initialViewCount?: number;
  currentUserId?: string | null;
  ownerId?: string | null;
  isPosted?: boolean;
  caption?: string | null;
  imageUrl?: string | null;
  onPostClick?: () => void;
}

/**
 * 投稿のアクションコンテナコンポーネント
 * いいね、コメント数、閲覧数、ダウンロード、シェアなどのアクションをまとめて表示
 */
export function PostActions({
  postId,
  initialLikeCount,
  initialCommentCount = 0,
  initialViewCount = 0,
  currentUserId,
  ownerId,
  isPosted = true,
  caption,
  imageUrl,
  onPostClick,
}: PostActionsProps) {
  const isOwner = currentUserId && ownerId ? currentUserId === ownerId : false;

  return (
    <div className="flex items-center gap-3 justify-start">
      <LikeButton
        imageId={postId}
        initialLikeCount={initialLikeCount}
        currentUserId={currentUserId}
      />
      <CommentCount count={initialCommentCount} />
      <ViewCount count={initialViewCount} />
      <div className="flex items-center gap-1">
        {/* オーナーのみダウンロードボタン（投稿済み・未投稿問わず表示） */}
        {isOwner && (
          <DownloadButton
            postId={postId}
            imageUrl={imageUrl}
          />
        )}
        {/* シェアボタン（投稿済みの場合のみ表示） */}
        {isPosted && (
          <ShareButton
            postId={postId}
            caption={caption}
            imageUrl={imageUrl}
          />
        )}
      </div>
      {/* 未投稿画像の場合のみ「＋ 投稿」ボタンを表示 */}
      {!isPosted && isOwner && onPostClick && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onPostClick}
          className="ml-auto"
        >
          <Plus className="h-4 w-4" />
          <span className="ml-1">投稿</span>
        </Button>
      )}
    </div>
  );
}

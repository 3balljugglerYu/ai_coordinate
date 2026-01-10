"use client";

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
    </div>
  );
}

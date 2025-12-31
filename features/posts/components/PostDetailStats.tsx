"use client";

import { LikeButton } from "./LikeButton";

interface PostDetailStatsProps {
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  currentUserId?: string | null;
  ownerId?: string | null;
  isPosted?: boolean;
  caption?: string | null;
  imageUrl?: string | null;
}

/**
 * 投稿詳細画面の統計情報コンポーネント（動的コンテンツ）
 * いいね数、コメント数、閲覧数など、リアルタイムで更新される可能性があるコンテンツ
 */
export function PostDetailStats({
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  currentUserId,
  ownerId,
  isPosted = true,
  caption,
  imageUrl,
}: PostDetailStatsProps) {
  return (
    <LikeButton
      imageId={postId}
      initialLikeCount={initialLikeCount}
      initialCommentCount={initialCommentCount}
      initialViewCount={initialViewCount}
      currentUserId={currentUserId}
      ownerId={ownerId}
      isPosted={isPosted}
      caption={caption}
      imageUrl={imageUrl}
    />
  );
}

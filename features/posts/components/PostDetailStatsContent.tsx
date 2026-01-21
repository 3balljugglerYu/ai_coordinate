"use client";

import { PostDetailStats } from "./PostDetailStats";

interface PostDetailStatsContentProps {
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  currentUserId?: string | null;
  ownerId?: string | null;
  isPosted: boolean;
  caption?: string | null;
  imageUrl?: string | null;
  onPostClick?: () => void;
}

/**
 * 投稿詳細画面の統計情報コンテンツコンポーネント（クライアントコンポーネント）
 * PostDetailStaticからcloneElementでonPostClickを受け取るために必要
 */
export function PostDetailStatsContent({
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  currentUserId,
  ownerId,
  isPosted,
  caption,
  imageUrl,
  onPostClick,
}: PostDetailStatsContentProps) {
  return (
    <PostDetailStats
      postId={postId}
      initialLikeCount={initialLikeCount}
      initialCommentCount={initialCommentCount}
      initialViewCount={initialViewCount}
      currentUserId={currentUserId}
      ownerId={ownerId}
      isPosted={isPosted}
      caption={caption}
      imageUrl={imageUrl}
      onPostClick={onPostClick}
    />
  );
}

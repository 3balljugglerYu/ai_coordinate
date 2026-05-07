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
  /** ダウンロード用の元画像 URL（PNG/JPEG）。`<DownloadButton>` まで流す */
  originalImageUrl?: string | null;
  onPostClick?: () => void;
}

/**
 * 投稿詳細画面の統計情報コンテンツコンポーネント（クライアントコンポーネント）
 * PostDetailStatic内でSuspenseと共に使用するためのラッパーです。
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
  originalImageUrl,
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
      originalImageUrl={originalImageUrl}
      onPostClick={onPostClick}
    />
  );
}

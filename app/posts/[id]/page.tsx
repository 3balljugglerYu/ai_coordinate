import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPost } from "@/features/posts/lib/server-api";
import { getPostImageUrl, getImageAspectRatio } from "@/features/posts/lib/utils";
import { PostDetailStatic } from "@/features/posts/components/PostDetailStatic";
import { PostDetailStats } from "@/features/posts/components/PostDetailStats";
import { PostDetailStatsSkeleton } from "@/features/posts/components/PostDetailStatsSkeleton";
import { CommentSection } from "@/features/posts/components/CommentSection";
import { CommentSectionSkeleton } from "@/features/posts/components/CommentSectionSkeleton";
import { createClient } from "@/lib/supabase/server";

interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

async function PostDetailStatsContent({
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  currentUserId,
  isPosted,
  caption,
  imageUrl,
}: {
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  currentUserId?: string | null;
  isPosted: boolean;
  caption?: string | null;
  imageUrl?: string | null;
}) {
  return (
    <PostDetailStats
      postId={postId}
      initialLikeCount={initialLikeCount}
      initialCommentCount={initialCommentCount}
      initialViewCount={initialViewCount}
      currentUserId={currentUserId}
      isPosted={isPosted}
      caption={caption}
      imageUrl={imageUrl}
    />
  );
}

async function CommentSectionContent({
  postId,
  currentUserId,
}: {
  postId: string;
  currentUserId?: string | null;
}) {
  return <CommentSection postId={postId} currentUserId={currentUserId} />;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params;

  // 現在のユーザーIDを取得（サーバーサイド）
  let currentUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch (error) {
    // 認証エラーは無視（ゲストユーザーとして扱う）
    console.error("Auth error:", error);
  }

  // 投稿詳細を取得（未投稿画像も所有者は閲覧可能）
  const post = await getPost(id, currentUserId);

  if (!post) {
    notFound();
  }

  // 画像URLとアスペクト比を取得
  const imageUrl = getPostImageUrl(post);
  const imageAspectRatio = imageUrl
    ? await getImageAspectRatio(imageUrl)
    : null;

  return (
    <>
      {/* 静的コンテンツ */}
      <PostDetailStatic
        post={post}
        currentUserId={currentUserId}
        imageAspectRatio={imageAspectRatio}
      >
        {/* 動的コンテンツ: いいね・コメント・ビュー数（ユーザー情報セクション内に配置） */}
        <Suspense fallback={<PostDetailStatsSkeleton />}>
          <PostDetailStatsContent
            postId={post.id || ""}
            initialLikeCount={post.like_count || 0}
            initialCommentCount={post.comment_count || 0}
            initialViewCount={post.view_count || 0}
            currentUserId={currentUserId}
            isPosted={post.is_posted || false}
            caption={post.caption}
            imageUrl={imageUrl}
          />
        </Suspense>
      </PostDetailStatic>

      {/* 動的コンテンツ: コメントセクション */}
      <Suspense fallback={<CommentSectionSkeleton />}>
        <CommentSectionContent postId={post.id || ""} currentUserId={currentUserId} />
      </Suspense>
    </>
  );
}

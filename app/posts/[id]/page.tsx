import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/features/posts/lib/server-api";
import { getPostImageUrl, getImageAspectRatio } from "@/features/posts/lib/utils";
import { PostDetailStatic } from "@/features/posts/components/PostDetailStatic";
import { PostDetailStats } from "@/features/posts/components/PostDetailStats";
import { PostDetailStatsSkeleton } from "@/features/posts/components/PostDetailStatsSkeleton";
import { CommentSection } from "@/features/posts/components/CommentSection";
import { CommentSectionSkeleton } from "@/features/posts/components/CommentSectionSkeleton";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { DEFAULT_TITLE_TAGLINE } from "@/constants";

// Next.js 16では、動的ルートはデフォルトで動的レンダリングされる
// キャッシュはfetchのrevalidateオプションまたはReact.cache()で制御
interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

function buildSanitizedText(
  text: string | null | undefined,
  fallback: string,
  maxLength: number
) {
  if (!text) return fallback;

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .trim();

  if (!normalized) return fallback;

  return normalized.slice(0, maxLength);
}

function buildDescription(caption?: string | null) {
  return buildSanitizedText(caption, "Persta.AIで作成したコーデ画像です。", 120);
}

function buildImageAlt(caption?: string | null) {
  return buildSanitizedText(caption, "Persta.AI 投稿画像", 80);
}

export async function generateMetadata({ params }: PostDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  
  // 投稿情報を取得（認証不要で取得可能な情報のみ）
  let post;
  try {
    post = await getPost(id, null);
  } catch (error) {
    // エラーが発生した場合は404用のメタデータを返す
    return {
      title: "投稿が見つかりません | Persta.AI",
      description: "指定された投稿は見つかりませんでした。",
    };
  }

  if (!post) {
    return {
      title: "投稿が見つかりません | Persta.AI",
      description: "指定された投稿は見つかりませんでした。",
    };
  }

  const siteUrl = getSiteUrl();
  const postUrl = siteUrl ? `${siteUrl}/posts/${id}` : "";
  const imageUrl = getPostImageUrl(post);
  
  const title = `Persta.AI | ${DEFAULT_TITLE_TAGLINE}`;
  const description = buildDescription(post.caption);
  const imageAlt = buildImageAlt(post.caption);
  // 画像URLが絶対URLであることを保証
  const ogImage = imageUrl && imageUrl.startsWith("http")
    ? imageUrl
    : siteUrl && imageUrl
    ? `${siteUrl}${imageUrl}`
    : imageUrl;

  const metadata: Metadata = {
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    title,
    description,
    alternates: postUrl ? { canonical: postUrl } : undefined,
    openGraph: {
      title,
      description,
      url: postUrl,
      siteName: "Persta.AI",
      type: "article",
      ...(ogImage && {
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: imageAlt,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage && {
        images: [ogImage],
      }),
    },
  };

  return metadata;
}

async function PostDetailStatsContent({
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  currentUserId,
  ownerId,
  isPosted,
  caption,
  imageUrl,
}: {
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  currentUserId?: string | null;
  ownerId?: string | null;
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
      ownerId={ownerId}
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
  // データベースからアスペクト比を取得（フォールバック: 存在しない場合は計算）
  let imageAspectRatio: "portrait" | "landscape" | null = post.aspect_ratio as "portrait" | "landscape" | null;
  if (!imageAspectRatio && imageUrl) {
    // フォールバック: データベースに値がない場合は計算（初回表示時など）
    imageAspectRatio = await getImageAspectRatio(imageUrl);
  }

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
            ownerId={post.user_id}
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

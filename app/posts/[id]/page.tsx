import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPost } from "@/features/posts/lib/server-api";
import { getPostDisplayUrl, getImageAspectRatio } from "@/features/posts/lib/utils";
import { isCrawler, isPrefetchRequest } from "@/lib/utils";
import { PostDetailContent } from "@/features/posts/components/PostDetailContent";
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
  // メタデータ生成時は常に閲覧数カウントをスキップ
  let post;
  try {
    post = await getPost(id, null, true);
  } catch {
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
  const imageUrl = getPostDisplayUrl(post);
  
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

  // プリフェッチまたはクローラーかどうかを判定
  let shouldSkipViewCount = false;
  
  try {
    const headersList = await headers();
    const userAgent = headersList.get('user-agent');
    
    const isPrefetch = isPrefetchRequest(headersList);
    // isCrawlerはisPrefetchがfalseの場合のみ評価される
    const isCrawlerReq = !isPrefetch && isCrawler(userAgent);
    shouldSkipViewCount = isPrefetch || isCrawlerReq;
    
    // デバッグ用ログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log('Request headers:', {
        'next-router-prefetch': headersList.get('next-router-prefetch'),
        'purpose': headersList.get('purpose'),
        'user-agent': userAgent,
        'isPrefetch': isPrefetch,
        'isCrawler': isCrawlerReq,
        'shouldSkipViewCount': shouldSkipViewCount,
      });
    }
  } catch (error) {
    // headers()の取得に失敗した場合は安全側に倒す（カウントしない）
    console.warn('Failed to get headers, skipping view count:', error);
    shouldSkipViewCount = true;
  }

  // 投稿詳細を取得（未投稿画像も所有者は閲覧可能）
  const post = await getPost(id, currentUserId, shouldSkipViewCount);

  if (!post) {
    notFound();
  }

  // 画像URLとアスペクト比を取得（詳細表示用は getPostDisplayUrl）
  const imageUrl = getPostDisplayUrl(post);
  // データベースからアスペクト比を取得（フォールバック: 存在しない場合は計算）
  let imageAspectRatio: "portrait" | "landscape" | null = post.aspect_ratio as "portrait" | "landscape" | null;
  if (!imageAspectRatio && imageUrl) {
    // フォールバック: データベースに値がない場合は計算（初回表示時など）
    imageAspectRatio = await getImageAspectRatio(imageUrl);
  }

  return (
    <PostDetailContent
      post={post}
      currentUserId={currentUserId}
      imageAspectRatio={imageAspectRatio}
      postId={post.id || ""}
      initialLikeCount={post.like_count || 0}
      initialCommentCount={post.comment_count || 0}
      initialViewCount={post.view_count || 0}
      ownerId={post.user_id}
      imageUrl={imageUrl}
    />
  );
}

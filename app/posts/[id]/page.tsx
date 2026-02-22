import type { Metadata } from "next";
import { getPost } from "@/features/posts/lib/server-api";
import { getPostDisplayUrl } from "@/features/posts/lib/utils";
import { isCrawler, isPrefetchRequest } from "@/lib/utils";
import { CachedPostDetail } from "@/features/posts/components/CachedPostDetail";
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

  // タイトルを投稿ごとに差別化（caption があれば使用、50-60文字を考慮して45文字まで）
  const titleSource = buildSanitizedText(post.caption, "", 45);
  const title = titleSource
    ? `${titleSource} | Persta.AI`
    : `Persta.AI | ${DEFAULT_TITLE_TAGLINE}`;
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

  // use cache でキャッシュして即時表示を優先（閲覧数はキャッシュ時スキップ）
  return (
    <CachedPostDetail postId={id} currentUserId={currentUserId} />
  );
}

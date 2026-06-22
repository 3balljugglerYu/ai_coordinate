import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getPost } from "../lib/server-api";
import {
  deriveAspectRatioFromDimensions,
  getImageAspectRatio,
  getPostDisplayUrl,
  getPostOriginalUrl,
} from "../lib/utils";
import { PostDetailContent } from "./PostDetailContent";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import { getPublishedStylePresetById } from "@/features/style-presets/lib/style-preset-repository";
import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";

interface CachedPostDetailProps {
  postId: string;
  currentUserId: string | null;
}

/**
 * 投稿詳細（use cache でサーバーキャッシュ）
 * postId, currentUserId を引数で受け取り、cookies/headers を use cache 内で使わない
 * キャッシュ時は閲覧数インクリメントをスキップ
 */
export async function CachedPostDetail({
  postId,
  currentUserId,
}: CachedPostDetailProps) {
  "use cache";
  cacheTag(`post-detail-${postId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const post = await getPost(postId, currentUserId, true, supabase);

  if (!post) {
    notFound();
  }

  if (post.user_id) {
    cacheTag(`subscription-ui-${post.user_id}`);
  }

  // One-Tap Style 投稿は、保存時メタデータに提供者情報を持たないため、
  // preset id から現在の提供者(プリセット単位優先→カテゴリ fallback)をライブ取得し、
  // メタデータへ注入する。これで詳細ページのカードにもクレジット(/style・ホームと同じ)が出る。
  const oneTapMeta = getOneTapStylePresetMetadata(post);
  if (oneTapMeta) {
    const presetSummary = await getPublishedStylePresetById(
      oneTapMeta.id,
      {},
      supabase,
    ).catch(() => null);
    const provider = presetSummary
      ? resolveStylePresetProvider(presetSummary)
      : null;
    if (
      provider &&
      post.generation_metadata &&
      typeof post.generation_metadata === "object"
    ) {
      const oneTapStyle = (post.generation_metadata as Record<string, unknown>)
        .oneTapStyle;
      if (oneTapStyle && typeof oneTapStyle === "object") {
        const target = oneTapStyle as Record<string, unknown>;
        target.providerUserId = provider.userId;
        target.providerNickname = provider.nickname;
        target.providerAvatarUrl = provider.avatarUrl;
      }
    }
  }

  const imageUrl = getPostDisplayUrl(post);
  // 表示は WebP（軽量）、ダウンロードは元の PNG/JPEG（高画質）。
  // この経路だけ二段構成にし、`<DownloadButton>` の挙動を `/coordinate` や
  // `/style` と揃える（生成直後の data URL と同じく拡張子で保存される）。
  const originalImageUrl = getPostOriginalUrl(post);
  // 1) width/height が揃っていれば派生で済ませる
  // 2) それが無理なら画像をフェッチして判定（最後のフォールバック）
  let imageAspectRatio: "portrait" | "landscape" | null =
    deriveAspectRatioFromDimensions(post.width ?? null, post.height ?? null);
  if (!imageAspectRatio && imageUrl) {
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
      originalImageUrl={originalImageUrl}
    />
  );
}

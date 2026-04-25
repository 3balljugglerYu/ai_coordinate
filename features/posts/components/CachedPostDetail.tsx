import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getPost } from "../lib/server-api";
import {
  deriveAspectRatioFromDimensions,
  getImageAspectRatio,
  getPostDisplayUrl,
} from "../lib/utils";
import { PostDetailContent } from "./PostDetailContent";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const imageUrl = getPostDisplayUrl(post);
  let imageAspectRatio: "portrait" | "landscape" | null =
    post.aspect_ratio as "portrait" | "landscape" | null;
  // 1) 既存 aspect_ratio が NULL でも、width/height が揃っていれば派生で済ませる
  // 2) それも無理なら従来通り画像をフェッチして判定（最後のフォールバック）
  if (!imageAspectRatio) {
    imageAspectRatio = deriveAspectRatioFromDimensions(
      post.width ?? null,
      post.height ?? null,
    );
  }
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
    />
  );
}

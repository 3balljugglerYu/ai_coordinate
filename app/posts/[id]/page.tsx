import { notFound } from "next/navigation";
import { getPost } from "@/features/posts/lib/server-api";
import { PostDetail } from "@/features/posts/components/PostDetail";
import { createClient } from "@/lib/supabase/server";

interface PostDetailPageProps {
  params: Promise<{ id: string }>;
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

  return <PostDetail post={post} currentUserId={currentUserId} />;
}

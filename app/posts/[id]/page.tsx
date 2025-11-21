import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPost } from "@/features/posts/lib/server-api";
import { getPostImageUrl } from "@/features/posts/lib/utils";
import { PostActions } from "@/features/posts/components/PostActions";

interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  // 投稿者情報の表示（Phase 5でプロフィール画面へのリンクを追加予定）
  const displayName =
    post.user?.email?.split("@")[0] ||
    post.user?.id?.slice(0, 8) ||
    "匿名ユーザー";

  return (
    <div className="container mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
        </Link>
        {post.id && post.user_id && (
          <PostActions
            postId={post.id}
            postUserId={post.user_id}
            currentCaption={post.caption}
            imageUrl={getPostImageUrl(post)}
          />
        )}
      </div>

      {/* 投稿者情報 */}
      <Card className="mb-6">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200">
            {post.user?.avatar_url ? (
              <Image
                src={post.user.avatar_url}
                alt={displayName}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-gray-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">
              {displayName}
            </span>
            {post.posted_at && (
              <p className="mt-1 text-xs text-gray-400">
                {new Date(post.posted_at).toLocaleString("ja-JP")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 画像 */}
      <Card className="mb-6 overflow-hidden">
        <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
          {getPostImageUrl(post) ? (
            <Image
              src={getPostImageUrl(post)}
              alt={post.caption || "投稿画像"}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 80vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              画像がありません
            </div>
          )}
        </div>
      </Card>

      {/* キャプション */}
      {post.caption && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {post.caption}
            </p>
          </CardContent>
        </Card>
      )}

      {/* いいね・コメント機能はPhase 4で実装予定 */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <p className="text-sm text-blue-900">
            いいね・コメント機能はPhase 4で実装予定です
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { getPost } from "@/features/posts/lib/server-api";
import {
  getPostBeforeImageUrl,
  getPostDisplayUrl,
} from "@/features/posts/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { PostComposerPage } from "@/features/posts/components/PostComposerPage";

/**
 * 投稿フォームの専用ページ。
 *
 * 以前はどの画面からもダイアログで開いていたが、キーボードに合わせて位置と
 * 高さを計算し直す「浮いた箱」がある限り、その途中の値が必ずどこかで見えて
 * ガクつく（#617〜#623）。通常のページにすれば箱自体が無くなり、キーボードの
 * 扱いはブラウザ標準に任せられる。
 */
export default async function NewPostPage({
  params,
}: {
  params: Promise<{ imageId: string }>;
}) {
  await connection();
  const { imageId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // getPost は未投稿でも所有者なら返す（server-api.ts の is_posted 判定）
  const post = await getPost(imageId, user.id, true);

  // 他人の画像は投稿できない。所有者以外はここで落とす。
  if (!post || post.user_id !== user.id) {
    notFound();
  }

  return (
    <PostComposerPage
      imageId={imageId}
      currentCaption={post.caption ?? undefined}
      afterImageUrl={getPostDisplayUrl(post)}
      beforeImageUrl={getPostBeforeImageUrl(post)}
      generationType={post.generation_type ?? null}
      sourcePostId={post.source_post_id ?? null}
    />
  );
}

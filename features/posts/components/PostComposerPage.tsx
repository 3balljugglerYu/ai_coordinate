"use client";

import { useRouter } from "next/navigation";

import type { GenerationType } from "@/features/generation/types";
import { PostModal } from "./PostModal";

interface PostComposerPageProps {
  imageId: string;
  currentCaption?: string;
  afterImageUrl?: string | null;
  beforeImageUrl?: string | null;
  generationType?: GenerationType | null;
  sourcePostId?: string | null;
}

/**
 * 投稿フォームの専用ページ側のつなぎ。
 *
 * 投稿しても、やめても**元の画面に戻す**。投稿の完了（トースト・付与モーダル）は
 * `LocaleShell` 直下の `PostProgressHost` が出すので、ここを離れても消えない。
 *
 * `refresh` を先に呼ぶのは、戻り先の一覧がサーバーで取得した `is_posted` を
 * 使っているため。これが無いとクライアントのキャッシュが使われ、投稿済みの
 * カードに「投稿」ボタンが残る。
 */
export function PostComposerPage(props: PostComposerPageProps) {
  const router = useRouter();

  const backToPreviousScreen = () => {
    router.refresh();
    router.back();
  };

  return (
    <PostModal
      open
      onOpenChange={(open) => {
        if (!open) backToPreviousScreen();
      }}
      imageId={props.imageId}
      currentCaption={props.currentCaption}
      afterImageUrl={props.afterImageUrl}
      beforeImageUrl={props.beforeImageUrl}
      generationType={props.generationType}
      sourcePostId={props.sourcePostId}
    />
  );
}

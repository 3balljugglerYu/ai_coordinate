"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PostDetailStatic } from "./PostDetailStatic";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import { CommentSection } from "./CommentSection";
import { CommentSectionSkeleton } from "./CommentSectionSkeleton";
import { incrementViewCountAPI } from "../lib/api";
import type { Post } from "../types";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

interface PostDetailContentProps {
  post: Post;
  currentUserId?: string | null;
  imageAspectRatio: "portrait" | "landscape" | null;
  postId: string;
  initialLikeCount: number;
  initialCommentCount: number;
  initialViewCount: number;
  ownerId?: string | null;
  imageUrl?: string | null;
  /** フィードと同じサムネイル URL。表示用画像が届くまでの繋ぎに使う */
  thumbnailUrl?: string | null;
  /** ダウンロード用の元画像 URL（PNG/JPEG）。`<DownloadButton>` まで流す */
  originalImageUrl?: string | null;
  /** 閲覧者の購読プラン。派生生成シートのモデル選択・上限に使う。 */
  viewerSubscriptionPlan?: SubscriptionPlan;
  /**
   * 閲覧者が運営（full admin）か。サーバー側で isFullAdmin により判定した値。
   * 通報対応でプロンプト全文を見るために使う（REQ-018）。表示の出し分けで
   * あり、本文そのものは getPost が admin にだけ payload へ含める。
   */
  viewerIsAdmin?: boolean;
  /** One-Tap のスタイルが、この閲覧者にとって開放済みか（ページ側で解決した値）。 */
  presetUnlockState?: PresetUnlockState;
}

export function PostDetailContent({
  post,
  currentUserId,
  imageAspectRatio,
  postId,
  initialLikeCount,
  initialCommentCount,
  initialViewCount,
  ownerId,
  imageUrl,
  thumbnailUrl,
  originalImageUrl,
  viewerSubscriptionPlan,
  viewerIsAdmin,
  presetUnlockState,
}: PostDetailContentProps) {
  const [hiddenPostId, setHiddenPostId] = useState<string | null>(null);
  const router = useRouter();
  const isHidden = hiddenPostId === post.id;

  // 閲覧数インクリメント（CachedPostDetailではサーバーでスキップするため、クライアントから呼び出し）
  useEffect(() => {
    if (postId) {
      incrementViewCountAPI(postId).catch(() => {
        // エラーは静かに無視
      });
    }
  }, [postId]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return;
      }

      setHiddenPostId(null);
      router.refresh();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router]);

  return (
    <>
      <PostDetailStatic
        post={post}
        currentUserId={currentUserId}
        imageAspectRatio={imageAspectRatio}
        postId={postId}
        initialLikeCount={initialLikeCount}
        initialCommentCount={initialCommentCount}
        initialViewCount={initialViewCount}
        ownerId={ownerId}
        imageUrl={imageUrl}
        thumbnailUrl={thumbnailUrl}
        originalImageUrl={originalImageUrl}
        isHidden={isHidden}
        onHidden={() => setHiddenPostId(postId)}
        viewerSubscriptionPlan={viewerSubscriptionPlan}
        viewerIsAdmin={viewerIsAdmin}
        presetUnlockState={presetUnlockState}
      />

      {!isHidden && (
        <Suspense fallback={<CommentSectionSkeleton />}>
          <CommentSection postId={post.id || ""} currentUserId={currentUserId} />
        </Suspense>
      )}
    </>
  );
}

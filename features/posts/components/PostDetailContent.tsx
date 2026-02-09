"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PostDetailStatic } from "./PostDetailStatic";
import { CommentSection } from "./CommentSection";
import { CommentSectionSkeleton } from "./CommentSectionSkeleton";
import type { Post } from "../types";

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
}: PostDetailContentProps) {
  const [hiddenPostId, setHiddenPostId] = useState<string | null>(null);
  const router = useRouter();
  const isHidden = hiddenPostId === post.id;

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
        isHidden={isHidden}
        onHidden={() => setHiddenPostId(postId)}
      />

      {!isHidden && (
        <Suspense fallback={<CommentSectionSkeleton />}>
          <CommentSection postId={post.id || ""} currentUserId={currentUserId} />
        </Suspense>
      )}
    </>
  );
}

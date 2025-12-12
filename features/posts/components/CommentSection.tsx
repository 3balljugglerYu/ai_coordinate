"use client";

import { useRef } from "react";
import { CommentInput } from "./CommentInput";
import { CommentList, type CommentListRef } from "./CommentList";

interface CommentSectionProps {
  postId: string;
  currentUserId?: string | null;
}

/**
 * コメントセクションコンポーネント（動的コンテンツ）
 * 認証状態に依存し、リアルタイムで更新される可能性があるコンテンツ
 */
export function CommentSection({ postId, currentUserId }: CommentSectionProps) {
  const commentListRef = useRef<CommentListRef>(null);

  return (
    <div className="container mx-auto max-w-4xl border-t border-gray-200 bg-white px-4 py-3">
      <div className="mb-4">
        <CommentInput
          imageId={postId}
          onCommentAdded={() => {
            // コメントが追加されたら、CommentListをリフレッシュ
            commentListRef.current?.refresh();
          }}
          currentUserId={currentUserId}
        />
      </div>
      <CommentList
        ref={commentListRef}
        imageId={postId}
        currentUserId={currentUserId}
      />
    </div>
  );
}


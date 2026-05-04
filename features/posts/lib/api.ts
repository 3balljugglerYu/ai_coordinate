import type {
  CommentDeleteResult,
  ParentComment,
  PostImageRequest,
  PostImageResponse,
  ReplyComment,
} from "../types";

interface PostsApiMessages {
  postFailed?: string;
  updateFailed?: string;
  deleteFailed?: string;
  likeToggleFailed?: string;
  likeStatusFetchFailed?: string;
  commentsFetchFailed?: string;
  commentCountFetchFailed?: string;
  commentCountBatchFetchFailed?: string;
  commentCreateFailed?: string;
  commentUpdateFailed?: string;
  commentDeleteFailed?: string;
  repliesFetchFailed?: string;
  replyCreateFailed?: string;
  likeCountFetchFailed?: string;
  likeCountBatchFetchFailed?: string;
}

/**
 * 投稿機能のクライアントサイドAPI関数
 */

/**
 * 画像を投稿
 */
export async function postImageAPI(
  request: PostImageRequest,
  messages?: PostsApiMessages
): Promise<PostImageResponse> {
  const response = await fetch("/api/posts/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || messages?.postFailed || "投稿に失敗しました");
  }

  return response.json();
}

/**
 * キャプションを更新
 * show_before_image が含まれていれば一緒に更新する。
 */
export async function updatePostCaption(
  request: PostImageRequest,
  messages?: PostsApiMessages
): Promise<PostImageResponse> {
  const response = await fetch("/api/posts/update", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || messages?.updateFailed || "更新に失敗しました");
  }

  return response.json();
}

/**
 * 投稿対象の生成画像に紐づく Before 画像 URL を取得する。
 * 永続パス未生成のときは image_jobs.input_image_url にフォールバック。
 * 取得できない / show_before_image=false のときは null。
 * 認可は server 側 RLS で担保（本人以外は 404）。
 */
export async function fetchBeforeSourceUrl(
  imageId: string
): Promise<string | null> {
  try {
    const response = await fetch(`/api/posts/${imageId}/before-source`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { before_image_url?: string | null };
    return data.before_image_url ?? null;
  } catch (error) {
    console.warn("Failed to fetch before-source URL:", error);
    return null;
  }
}

/**
 * 閲覧数をインクリメント（コンテンツ詳細表示時にクライアントから呼び出し）
 */
export async function incrementViewCountAPI(postId: string): Promise<void> {
  const response = await fetch(`/api/posts/${postId}/view`, {
    method: "POST",
  });
  if (!response.ok) {
    // エラー時は静かに失敗（閲覧数は表示の邪魔をしない）
    console.warn("Failed to increment view count:", await response.text());
  }
}

/**
 * 投稿を削除
 */
export async function deletePost(
  id: string,
  messages?: PostsApiMessages
): Promise<void> {
  const response = await fetch(`/api/posts/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || messages?.deleteFailed || "削除に失敗しました");
  }
}

/**
 * いいねの追加・削除（トグル）
 */
export async function toggleLikeAPI(
  imageId: string,
  messages?: PostsApiMessages
): Promise<boolean> {
  const response = await fetch(`/api/posts/${imageId}/like`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.likeToggleFailed || "いいねの処理に失敗しました"
    );
  }

  const data = await response.json();
  return data.isLiked;
}

/**
 * いいね数を取得（単一）
 */
export async function getLikeCountAPI(
  imageId: string,
  messages?: PostsApiMessages
): Promise<number> {
  const response = await fetch(`/api/posts/${imageId}/like`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error || messages?.likeCountFetchFailed || "いいね数の取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.count || 0;
}

/**
 * いいね数を一括取得（バッチ、特殊用途向け）
 */
export async function getLikeCountsBatchAPI(
  imageIds: string[],
  messages?: PostsApiMessages
): Promise<Record<string, number>> {
  const response = await fetch("/api/posts/likes/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error ||
        messages?.likeCountBatchFetchFailed ||
        "いいね数の一括取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.counts || {};
}

/**
 * いいね状態を取得
 */
export async function getUserLikeStatusAPI(
  imageId: string,
  messages?: PostsApiMessages
): Promise<boolean> {
  const response = await fetch(`/api/posts/${imageId}/like-status`);

  if (!response.ok) {
    // 401エラーの場合は未ログインなのでfalseを返す
    if (response.status === 401) {
      return false;
    }
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error ||
        messages?.likeStatusFetchFailed ||
        "いいね状態の取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.isLiked || false;
}

/**
 * コメント一覧を取得
 */
export async function getCommentsAPI(
  imageId: string,
  limit: number,
  offset: number,
  messages?: PostsApiMessages
): Promise<ParentComment[]> {
  const response = await fetch(
    `/api/posts/${imageId}/comments?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.commentsFetchFailed || "コメントの取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.comments || [];
}

/**
 * コメント数を取得（単一）
 */
export async function getCommentCountAPI(
  imageId: string,
  messages?: PostsApiMessages
): Promise<number> {
  const counts = await getCommentCountsBatchAPI([imageId], messages);
  return counts[imageId] || 0;
}

/**
 * コメント数を一括取得（バッチ、特殊用途向け）
 */
export async function getCommentCountsBatchAPI(
  imageIds: string[],
  messages?: PostsApiMessages
): Promise<Record<string, number>> {
  const response = await fetch("/api/posts/comments/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageIds }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error ||
        messages?.commentCountBatchFetchFailed ||
        "コメント数の一括取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.counts || {};
}

/**
 * コメントを投稿
 */
export async function createCommentAPI(
  imageId: string,
  content: string,
  messages?: PostsApiMessages
): Promise<ParentComment> {
  const response = await fetch(`/api/posts/${imageId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error ||
        messages?.commentCreateFailed ||
        "コメントの投稿に失敗しました"
    );
  }

  const data = await response.json();
  return data.comment;
}

/**
 * コメントを編集
 */
export async function updateCommentAPI(
  commentId: string,
  content: string,
  messages?: PostsApiMessages
): Promise<ParentComment | ReplyComment> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error ||
        messages?.commentUpdateFailed ||
        "コメントの編集に失敗しました"
    );
  }

  const data = await response.json();
  return data.comment;
}

/**
 * コメントを削除
 */
export async function deleteCommentAPI(
  commentId: string,
  messages?: PostsApiMessages
): Promise<CommentDeleteResult> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error ||
        messages?.commentDeleteFailed ||
        "コメントの削除に失敗しました"
    );
  }

  return response.json();
}

/**
 * 返信一覧を取得
 */
export async function getRepliesAPI(
  parentCommentId: string,
  limit: number,
  offset: number,
  messages?: PostsApiMessages
): Promise<ReplyComment[]> {
  const response = await fetch(
    `/api/comments/${parentCommentId}/replies?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.repliesFetchFailed || "返信の取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.replies || [];
}

/**
 * 返信を投稿
 */
export async function createReplyAPI(
  parentCommentId: string,
  content: string,
  messages?: PostsApiMessages
): Promise<ReplyComment> {
  const response = await fetch(`/api/comments/${parentCommentId}/replies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.replyCreateFailed || "返信の投稿に失敗しました"
    );
  }

  const data = await response.json();
  return data.reply;
}

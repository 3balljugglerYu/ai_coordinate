import type { PostImageRequest, PostImageResponse } from "../types";

/**
 * 投稿機能のクライアントサイドAPI関数
 */

/**
 * 画像を投稿
 */
export async function postImageAPI(
  request: PostImageRequest
): Promise<PostImageResponse> {
  const response = await fetch("/api/posts/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "投稿に失敗しました");
  }

  return response.json();
}

/**
 * キャプションを更新
 */
export async function updatePostCaption(
  request: PostImageRequest
): Promise<PostImageResponse> {
  const response = await fetch("/api/posts/update", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "更新に失敗しました");
  }

  return response.json();
}

/**
 * 投稿を削除
 */
export async function deletePost(id: string): Promise<void> {
  const response = await fetch(`/api/posts/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "削除に失敗しました");
  }
}

/**
 * いいねの追加・削除（トグル）
 */
export async function toggleLikeAPI(imageId: string): Promise<boolean> {
  const response = await fetch(`/api/posts/${imageId}/like`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "いいねの処理に失敗しました");
  }

  const data = await response.json();
  return data.isLiked;
}

/**
 * いいね数を取得（単一）
 */
export async function getLikeCountAPI(imageId: string): Promise<number> {
  const response = await fetch(`/api/posts/${imageId}/like`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "いいね数の取得に失敗しました");
  }

  const data = await response.json();
  return data.count || 0;
}

/**
 * いいね数を一括取得（バッチ、特殊用途向け）
 */
export async function getLikeCountsBatchAPI(imageIds: string[]): Promise<Record<string, number>> {
  const response = await fetch("/api/posts/likes/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "いいね数の一括取得に失敗しました");
  }

  const data = await response.json();
  return data.counts || {};
}

/**
 * いいね状態を取得
 */
export async function getUserLikeStatusAPI(imageId: string): Promise<boolean> {
  const response = await fetch(`/api/posts/${imageId}/like-status`);

  if (!response.ok) {
    // 401エラーの場合は未ログインなのでfalseを返す
    if (response.status === 401) {
      return false;
    }
    const error = await response.json();
    throw new Error(error.error || "いいね状態の取得に失敗しました");
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
  offset: number
): Promise<Array<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>> {
  const response = await fetch(
    `/api/posts/${imageId}/comments?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメントの取得に失敗しました");
  }

  const data = await response.json();
  return data.comments || [];
}

/**
 * コメント数を取得（単一）
 */
export async function getCommentCountAPI(imageId: string): Promise<number> {
  const response = await fetch(`/api/posts/${imageId}/comments?limit=1&offset=0`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメント数の取得に失敗しました");
  }

  // 実際にはコメント数を直接取得するAPIが必要だが、現時点ではコメント一覧から推測
  // 将来的に専用APIを追加する可能性あり
  const data = await response.json();
  return data.comments?.length || 0;
}

/**
 * コメント数を一括取得（バッチ、特殊用途向け）
 */
export async function getCommentCountsBatchAPI(
  imageIds: string[]
): Promise<Record<string, number>> {
  const response = await fetch("/api/posts/comments/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメント数の一括取得に失敗しました");
  }

  const data = await response.json();
  return data.counts || {};
}

/**
 * コメントを投稿
 */
export async function createCommentAPI(
  imageId: string,
  content: string
): Promise<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}> {
  const response = await fetch(`/api/posts/${imageId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメントの投稿に失敗しました");
  }

  const data = await response.json();
  return data.comment;
}

/**
 * コメントを編集
 */
export async function updateCommentAPI(
  commentId: string,
  content: string
): Promise<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメントの編集に失敗しました");
  }

  const data = await response.json();
  return data.comment;
}

/**
 * コメントを削除
 */
export async function deleteCommentAPI(commentId: string): Promise<void> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "コメントの削除に失敗しました");
  }
}

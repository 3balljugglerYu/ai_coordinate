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

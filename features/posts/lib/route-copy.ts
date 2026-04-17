import type { Locale } from "@/i18n/config";

export const postsRouteCopy = {
  ja: {
    authRequired: "ログインが必要です",
    imageIdRequired: "画像IDが必要です",
    commentIdRequired: "コメントIDが必要です",
    contentRequired: "コメント内容を入力してください",
    invalidLimit: "limit は 1 以上 100 以下で指定してください",
    invalidOffset: "offset は 0 以上で指定してください",
    invalidImageIds: "imageIds には 1 件以上の配列を指定してください",
    batchSizeExceeded: "バッチサイズは100件以下にしてください",
    postsFetchFailed: "投稿の取得に失敗しました",
    viewCountUpdateFailed: "閲覧数の更新に失敗しました",
    postFailed: "投稿に失敗しました",
    updateFailed: "更新に失敗しました",
    deleteFailed: "投稿の取り消しに失敗しました",
    commentsFetchFailed: "コメントの取得に失敗しました",
    commentCreateFailed: "コメントの投稿に失敗しました",
    commentUpdateFailed: "コメントの編集に失敗しました",
    commentDeleteFailed: "コメントの削除に失敗しました",
    deletedCommentPlaceholder: "このコメントは削除されました",
    commentRequired: "コメントを入力してください",
    commentInvalidCharacters: "< と > は使用できません",
    commentTooLong: (max: number) =>
      `コメントは${max}文字以内で入力してください`,
    likeToggleFailed: "いいねの処理に失敗しました",
    likeStatusFetchFailed: "いいね状態の取得に失敗しました",
    likeCountsBatchFetchFailed: "いいね数の一括取得に失敗しました",
    commentCountsBatchFetchFailed: "コメント数の一括取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    imageIdRequired: "Image ID is required.",
    commentIdRequired: "Comment ID is required.",
    contentRequired: "Enter the comment content.",
    invalidLimit: "limit must be between 1 and 100.",
    invalidOffset: "offset must be 0 or greater.",
    invalidImageIds: "imageIds must be a non-empty array.",
    batchSizeExceeded: "Batch size must be 100 or less.",
    postsFetchFailed: "Failed to fetch posts.",
    viewCountUpdateFailed: "Failed to update the view count.",
    postFailed: "Failed to publish the post.",
    updateFailed: "Failed to update the post.",
    deleteFailed: "Failed to remove the post.",
    commentsFetchFailed: "Failed to fetch the comments.",
    commentCreateFailed: "Failed to post the comment.",
    commentUpdateFailed: "Failed to update the comment.",
    commentDeleteFailed: "Failed to delete the comment.",
    deletedCommentPlaceholder: "This comment has been deleted.",
    commentRequired: "Enter a comment.",
    commentInvalidCharacters: "< and > are not allowed.",
    commentTooLong: (max: number) =>
      `Comment must be ${max} characters or fewer.`,
    likeToggleFailed: "Failed to update the like.",
    likeStatusFetchFailed: "Failed to fetch the like status.",
    likeCountsBatchFetchFailed: "Failed to fetch like counts in batch.",
    commentCountsBatchFetchFailed: "Failed to fetch comment counts in batch.",
  },
} as const satisfies Record<
  Locale,
  {
    authRequired: string;
    imageIdRequired: string;
    commentIdRequired: string;
    contentRequired: string;
    invalidLimit: string;
    invalidOffset: string;
    invalidImageIds: string;
    batchSizeExceeded: string;
    postsFetchFailed: string;
    viewCountUpdateFailed: string;
    postFailed: string;
    updateFailed: string;
    deleteFailed: string;
    commentsFetchFailed: string;
    commentCreateFailed: string;
    commentUpdateFailed: string;
    commentDeleteFailed: string;
    deletedCommentPlaceholder: string;
    commentRequired: string;
    commentInvalidCharacters: string;
    commentTooLong: (max: number) => string;
    likeToggleFailed: string;
    likeStatusFetchFailed: string;
    likeCountsBatchFetchFailed: string;
    commentCountsBatchFetchFailed: string;
  }
>;

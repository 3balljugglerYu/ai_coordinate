import type { Locale } from "@/i18n/config";

export const followRouteCopy = {
  ja: {
    authRequired: "ログインが必要です",
    userIdRequired: "ユーザーIDが必要です",
    cannotFollowSelf: "自分自身をフォローすることはできません",
    followStatusCheckFailed: "フォロー状態の確認に失敗しました",
    alreadyFollowing: "すでにこのユーザーをフォローしています",
    followInsertFailed: "フォローの追加に失敗しました",
    followFailed: "フォローの処理に失敗しました",
    unfollowFailed: "フォロー解除の処理に失敗しました",
    fetchStatusFailed: "フォロー状態の取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    userIdRequired: "User ID is required.",
    cannotFollowSelf: "You cannot follow yourself.",
    followStatusCheckFailed: "Failed to verify the follow status.",
    alreadyFollowing: "You are already following this user.",
    followInsertFailed: "Failed to follow this user.",
    followFailed: "Failed to update the follow state.",
    unfollowFailed: "Failed to unfollow this user.",
    fetchStatusFailed: "Failed to fetch the follow status.",
  },
} as const satisfies Record<
  Locale,
  {
    authRequired: string;
    userIdRequired: string;
    cannotFollowSelf: string;
    followStatusCheckFailed: string;
    alreadyFollowing: string;
    followInsertFailed: string;
    followFailed: string;
    unfollowFailed: string;
    fetchStatusFailed: string;
  }
>;

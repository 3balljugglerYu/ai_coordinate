import type { Locale } from "@/i18n/config";

export const userRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    userIdRequired: "ユーザーIDが必要です",
    forbidden: "権限がありません",
    fileRequired: "ファイルが選択されていません",
    imageOnly: "画像ファイルのみアップロード可能です",
    fileTooLarge: "ファイルサイズは10MB以下にしてください",
    avatarUploadFailed: "画像のアップロードに失敗しました",
    profileUpdateFailed: "プロフィールの更新に失敗しました",
    profileNotFound: "プロフィールが見つかりません",
    profileFetchFailed: "プロフィールの取得に失敗しました",
    postsFetchFailed: "投稿の取得に失敗しました",
    nicknameRequired: "ニックネームを入力してください",
    nicknameTooLong: "ニックネームは20文字以内で入力してください",
    bioTooLong: "自己紹介は200文字以内で入力してください",
    invalidCharacters: "< と > は使用できません",
    nicknameMustBeString: "ニックネームは文字列である必要があります",
    bioMustBeString: "自己紹介は文字列である必要があります",
  },
  en: {
    authRequired: "You need to be logged in.",
    userIdRequired: "A user ID is required.",
    forbidden: "You do not have permission to perform this action.",
    fileRequired: "Select a file before uploading.",
    imageOnly: "Only image files can be uploaded.",
    fileTooLarge: "File size must be 10MB or smaller.",
    avatarUploadFailed: "Failed to upload the image.",
    profileUpdateFailed: "Failed to update the profile.",
    profileNotFound: "The profile could not be found.",
    profileFetchFailed: "Failed to load the profile.",
    postsFetchFailed: "Failed to load the posts.",
    nicknameRequired: "Enter a nickname.",
    nicknameTooLong: "Nickname must be 20 characters or fewer.",
    bioTooLong: "Bio must be 200 characters or fewer.",
    invalidCharacters: "< and > are not allowed.",
    nicknameMustBeString: "Nickname must be a string.",
    bioMustBeString: "Bio must be a string.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getUserRouteCopy(locale: Locale) {
  return userRouteCopy[locale];
}

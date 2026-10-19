import type { RecipientLookupError } from "./repository";

/** 宛先の行が送れない理由(管理画面は日本語のみ) */
export function recipientLookupErrorMessage(
  error: RecipientLookupError,
  duplicateOfLine: number | null
): string {
  switch (error) {
    case "invalid_input":
      return "投稿のURL・プロフィールのURL・ユーザーIDのどれでもありません";
    case "post_not_found":
      return "投稿が見つかりません";
    case "post_not_visible":
      return "作品が公開中ではありません";
    case "user_not_found":
      return "ユーザーが見つかりません";
    case "user_unavailable":
      return "退会・停止中のユーザーです";
    case "duplicate":
      return duplicateOfLine
        ? `${duplicateOfLine}行目と同じ人です`
        : "同じ人が2回入っています";
  }
}

/** send_personal_notice / retract の PN_* コードを画面の文にする */
export function personalNoticeErrorMessage(code: string): string {
  switch (code) {
    case "PN_ADMIN_REQUIRED":
      return "送れる管理者として登録されていません(admin_users)";
    case "PN_MEMO_INVALID":
      return "管理用のメモは1〜100文字で入力してください";
    case "PN_TITLE_INVALID":
      return "題名は1〜60文字で入力してください";
    case "PN_PLACEHOLDER_IN_TITLE":
      return "{受付番号} は本文にだけ入れられます(題名では置き換わりません)";
    case "PN_BODY_INVALID":
      return "本文は1〜2000文字で入力してください";
    case "PN_RECIPIENT_COUNT_OUT_OF_RANGE":
    case "PN_RECIPIENTS_INVALID":
      return "宛先は1〜200人にしてください";
    case "PN_CODE_PREFIX_REQUIRED":
      return "本文に {受付番号} があるときは、頭の英字を入れてください";
    case "PN_CODE_PREFIX_INVALID":
      return "頭の英字は英大文字2〜5文字で入力してください";
    case "PN_RECIPIENT_INVALID":
    case "PN_RECIPIENT_NOT_AVAILABLE":
    case "PN_POST_NOT_ALLOWED":
    case "PN_RECIPIENT_DUPLICATED":
      return "送れない宛先があります。もう一度確かめてください";
    case "PN_CODE_EXHAUSTED":
      return "受付番号を作れませんでした。頭の英字を変えて送り直してください";
    case "PN_RECIPIENT_ROW_NOT_FOUND":
      return "取り消す相手が見つかりません";
    default:
      return "送れませんでした。時間をおいてもう一度お試しください";
  }
}

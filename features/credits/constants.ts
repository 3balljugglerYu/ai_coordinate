/**
 * ペルコイン関連の定数
 */

/** 残高不足エラーメッセージのプレフィックス（購入リンク表示の判定に使用） */
export const PERCOIN_INSUFFICIENT_ERROR_PREFIX = "ペルコイン残高が不足";

/**
 * エラーメッセージがペルコイン残高不足かどうかを判定
 */
export function isPercoinInsufficientError(error: string): boolean {
  return error.includes(PERCOIN_INSUFFICIENT_ERROR_PREFIX);
}

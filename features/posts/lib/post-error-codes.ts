/**
 * 投稿 API のエラーコードと判定ヘルパー。
 *
 * `features/posts/lib/api.ts` から分離している理由:
 * api.ts はテストで頻繁に `jest.mock` されるため、そこに定数やクラスを置くと
 * モック側に export が無いときに `undefined` となり、`instanceof` や定数比較が
 * 壊れる。実際に PostModal の既存テストがこれで落ちた。
 *
 * エラー判定は `instanceof` ではなく **`code` プロパティの構造的チェック**で行う。
 * モジュール境界をまたいでもモックされても壊れないため。
 */

/** 公開停止中のコンテンツを再投稿しようとしたときに API が返す errorCode。 */
export const POSTS_SUSPENDED_CANNOT_PUBLISH = "POSTS_SUSPENDED_CANNOT_PUBLISH";

/**
 * 公開停止中のため投稿できないエラーかどうか。
 *
 * 実際のブロックは DB trigger `enforce_no_publish_while_removed` が行う。
 * この判定はダイアログを出すための UI 分岐であって、権限境界ではない。
 */
export function isSuspendedPublishError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === POSTS_SUSPENDED_CANNOT_PUBLISH;
}

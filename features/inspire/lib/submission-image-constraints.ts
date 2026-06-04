/**
 * Inspire / Creator Looks 投稿画像の寸法制約 (client・server 共有の純粋定数)
 *
 * sharp や DOM に依存しない純粋なモジュールなので、サーバ側の検証
 * (`creator-looks-image.ts`) とクライアントの選択時チェック
 * (`UserStyleTemplateSubmissionForm.tsx`) の双方から安全に import できる。
 * 下限 768px の値はこのファイルを単一の真実源 (source of truth) とする。
 */

/**
 * 投稿画像の各辺の下限 (px)。
 * 低解像度・超縦長/横長の素材は生成品質を落とすため、両辺ともこの値以上を要求する。
 */
export const SUBMISSION_IMAGE_MIN_DIMENSION = 768;

/**
 * 画像が下限を下回るか (= reject 対象か) を判定する。
 * 片辺でも下限未満なら true を返す。
 */
export function isSubmissionImageTooSmall(
  width: number,
  height: number,
): boolean {
  return (
    width < SUBMISSION_IMAGE_MIN_DIMENSION ||
    height < SUBMISSION_IMAGE_MIN_DIMENSION
  );
}

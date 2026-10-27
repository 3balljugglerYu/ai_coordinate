/**
 * 派生投稿の詳細（`CachedPostDetail`）は、原作の参照カード（サムネイル・生成前の画像）を
 * 一緒にキャッシュしている。原作の側が変わったとき（取り消し・公開停止・
 * 「生成前の画像も表示する」の変更）に、原作を指す派生投稿の詳細もまとめて失効させる
 * ためのタグ。原作の `post-detail-${id}` を消すだけでは、派生投稿の詳細に古い写真が残る。
 */
export function sourceReferenceCacheTag(originPostId: string): string {
  return `post-source-${originPostId}`;
}

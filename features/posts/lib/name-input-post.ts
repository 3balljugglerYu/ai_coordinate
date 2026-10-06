/**
 * 名前の欄に名前を入れて作った投稿か。
 *
 * Worker は名前を使って生成したとき、`nameInputUsed: true` だけを generation_metadata に残す
 * (名前そのものは投稿側に残さない。shared/generation/job-metadata.ts)。
 */
export function isNameInputPost(post: { generation_metadata?: unknown }): boolean {
  const metadata = post.generation_metadata;
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { nameInputUsed?: unknown }).nameInputUsed === true;
}

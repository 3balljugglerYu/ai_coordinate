/**
 * ガチャプロンプトで作った投稿か。
 *
 * Worker はガチャで生成したとき、何番が出たか(`gachaPicks`)を generation_metadata に残す
 * (shared/generation/job-metadata.ts)。ほかの人のガチャプロンプトで作った投稿にも付く。
 * 中身(候補の文)は残らないので、秘匿の境界は越えない。
 */
export function isGachaPost(post: { generation_metadata?: unknown }): boolean {
  const metadata = post.generation_metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const picks = (metadata as { gachaPicks?: unknown }).gachaPicks;
  return Array.isArray(picks) && picks.length > 0;
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHashtag } from "@/lib/hashtag";

/**
 * 投稿時に出すタグ候補を組み立てる。
 *
 * タグがまだ 1 件しか無い状態（実測: 公開投稿 1,480 件中 `#` を含むのは 1 件）から
 * 立ち上げるため、候補の供給源を 2 つ持つ:
 *
 *  1. **作品の文脈** — その作品を作ったプリセットの企画に設定されたタグ
 *  2. **自分が前に使ったタグ** — 1 が空のときの受け皿。繰り返し投稿する人に効く
 *
 * ⚠️ 候補は出すだけで、**押して初めて説明文に入る**。自動でタグは付けない。
 */

/** 返す候補の上限。多すぎると選ぶ手間になる。 */
const MAX_SUGGESTIONS = 8;

/** 「自分が前に使ったタグ」を探す範囲。 */
const RECENT_SCAN_LIMIT = 50;

export interface HashtagSuggestion {
  /** `#` を含まない表記 */
  name: string;
  /** どこから出てきた候補か。UI の並び順と説明に使う。 */
  source: "category" | "recent";
}

/**
 * @param userId 投稿しようとしている本人。作品の所有者と一致しない場合は文脈を返さない
 *   （他人の作品 ID を渡して、どの企画で作られたかを覗けないようにする）
 * @param imageId generated_images.id
 */
export async function getHashtagSuggestions(
  userId: string,
  imageId: string
): Promise<HashtagSuggestion[]> {
  try {
    const supabase = createAdminClient();

    const { data: image } = await supabase
      .from("generated_images")
      .select("user_id, image_job_id")
      .eq("id", imageId)
      .maybeSingle();

    if (!image || image.user_id !== userId) {
      return [];
    }

    const [categoryTags, recentTags] = await Promise.all([
      findCategoryTags(supabase, image.image_job_id as string | null),
      findRecentlyUsedTags(supabase, userId),
    ]);

    const seen = new Set<string>();
    const result: HashtagSuggestion[] = [];

    for (const [names, source] of [
      [categoryTags, "category"] as const,
      [recentTags, "recent"] as const,
    ]) {
      for (const name of names) {
        const key = normalizeHashtag(name);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ name, source });
        if (result.length >= MAX_SUGGESTIONS) return result;
      }
    }

    return result;
  } catch (error) {
    // 候補が出ないだけで投稿はできる。ここで投稿画面を壊さない
    console.error("Hashtag suggestions failed:", error);
    return [];
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 作品 → プリセット → カテゴリ → 設定されたタグ。
 *
 * プリセットの ID は `generation_prompt_snapshots.source_revision` にある
 * （`image_jobs.style_template_id` には入っていない）。2026-07-29 以降の
 * One-Tap 生成にのみ記録があるため、それ以前の作品では候補が出ない。
 */
async function findCategoryTags(
  supabase: AdminClient,
  imageJobId: string | null
): Promise<string[]> {
  if (!imageJobId) return [];

  const { data: snapshot } = await supabase
    .from("generation_prompt_snapshots")
    .select("source_revision")
    .eq("image_job_id", imageJobId)
    .eq("source_kind", "one_tap_style")
    .maybeSingle();

  const presetId = (snapshot as { source_revision?: string } | null)
    ?.source_revision;
  if (!presetId) return [];

  const { data: preset } = await supabase
    .from("style_presets")
    .select("category_id")
    .eq("id", presetId)
    .maybeSingle();

  const categoryId = (preset as { category_id?: string } | null)?.category_id;
  if (!categoryId) return [];

  const { data: category } = await supabase
    .from("preset_categories")
    .select("hashtag_suggestions")
    .eq("id", categoryId)
    .maybeSingle();

  return (
    (category as { hashtag_suggestions?: string[] } | null)
      ?.hashtag_suggestions ?? []
  );
}

/** 直近で自分が使ったタグ。新しい順で、同じタグは畳む。 */
async function findRecentlyUsedTags(
  supabase: AdminClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("post_hashtags")
    .select("created_at, hashtags(name), generated_images!inner(user_id)")
    .eq("generated_images.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_SCAN_LIMIT);

  const rows = (data ?? []) as Array<{
    hashtags?: { name?: string } | { name?: string }[] | null;
  }>;

  const names: string[] = [];
  for (const row of rows) {
    // 埋め込みは 1 件でも配列で返ることがある
    const tag = Array.isArray(row.hashtags) ? row.hashtags[0] : row.hashtags;
    const name = tag?.name;
    if (name) names.push(name);
  }

  return names;
}

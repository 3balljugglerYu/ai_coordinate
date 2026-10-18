import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashtagCampaignSubmissionsTag } from "./get-submission-pages";

/**
 * 対象作品(応募作)の投稿 ID。投稿の画像の左上のラベルと、企画仕様の
 * 「このカタログで生成する」を出すかの判定に使う(2026-10-16 ユーザー指示)。
 *
 * 企画ページの「キャンペーン対象作品」と同じ list_hashtag_campaign_submissions
 * (いまも公開中で、いまもハッシュタグが付いている応募作)を読むので、ラベルの付いた作品は
 * 企画ページの一覧にも並ぶ。
 *
 * 使えるか(validate_derived_prompt_sources)はここでは見ない。使えない作品には
 * 「このカタログで生成する」がもともと出ないので、ラベルだけ付いても困らない。
 *
 * **読めなければ空配列**(ラベルとボタンが普段の見た目になるだけ)。
 */

/** 取り出す上限(新しいほうから)。RPC が受け付ける最大の数 */
export const TARGET_POST_ID_LIMIT = 500;

export async function getHashtagCampaignTargetPostIds(
  campaignKey: string,
): Promise<string[]> {
  "use cache";
  cacheTag(hashtagCampaignSubmissionsTag(campaignKey));
  cacheLife("minutes");

  const { data, error } = await createAdminClient().rpc(
    "list_hashtag_campaign_submissions",
    {
      p_campaign_key: campaignKey,
      p_limit: TARGET_POST_ID_LIMIT,
    },
  );
  if (error) {
    console.error("Failed to list hashtag campaign target posts", { code: error.code });
    return [];
  }

  return ((data ?? []) as { post_id: string }[]).map((row) => row.post_id);
}

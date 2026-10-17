import {
  getCampaignSubmissionPages,
  type CampaignSubmissionItem,
} from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import {
  HALLOWEEN_BEST_SHOT,
  isHalloweenBestShotOpen,
} from "@/features/campaigns/halloween/halloween-best-shot";

/**
 * ホームの「ハロウィン企画」の棚に並べる対象作品(2026-10-17 ユーザー決定)。
 *
 * - 並びは企画ページの一覧と同じ(新しい順・同じ人の作品が続かない)。その先頭から上限まで
 * - 期間外は読みに行かない
 * - **読めなかったら空を返す(投げない)。** 棚はこの値が空なら出ないだけで、
 *   同じ区画の「簡単お着替え」は出す。呼び出し側は待たずに先に走らせてよい
 */
export async function getHomeHalloweenShelfItems(
  nowMs: number,
): Promise<CampaignSubmissionItem[]> {
  if (!isHalloweenBestShotOpen(nowMs)) {
    return [];
  }
  try {
    const pages = await getCampaignSubmissionPages(HALLOWEEN_BEST_SHOT.campaignKey);
    return pages.flat().slice(0, HALLOWEEN_BEST_SHOT.homeShelf.maxItems);
  } catch (error) {
    console.error("Failed to load the home Halloween shelf", error);
    return [];
  }
}

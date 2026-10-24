import {
  getCampaignSubmissionPages,
  type CampaignSubmissionItem,
} from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import {
  HALLOWEEN_BEST_SHOT,
  isHalloweenBestShotOpen,
} from "@/features/campaigns/halloween/halloween-best-shot";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ホームの「ハロウィン企画」の棚に並べる対象作品(2026-10-17 ユーザー決定)。
 *
 * - 並びは企画ページの一覧と同じ(新しい順・なるべく同じ人の作品が続かない)。その先頭から上限まで。
 *   ちがう人の作品が足りないうちは、同じ人の作品が続くこともある(paginate.ts)
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

/** ホームの棚の上に出す、エントリーした人の進み具合 */
export interface HomeHalloweenEntryProgressData {
  /** 使ったちがう対象作品の数(エントリー前の投稿も含む) */
  usedWorks: number;
}

type ProgressRow = {
  used_works: number | null;
  entered_at: string | null;
};

/**
 * エントリーした人の進み具合(2026-10-17 ユーザー指示: エントリーした人は、ホームのハロウィン企画の上に進み具合を出す)。
 *
 * 数え方は企画ページの進み具合と同じ get_hashtag_campaign_progress(本人ごとの値なので、キャッシュしない)。
 * 未ログイン・期間外・未エントリーなら null。期間外とログインしていないときは読みに行かない。
 * **読めなかったら null を返す(投げない)。** 進み具合が出ないだけで、棚と簡単お着替えは出す。
 */
export async function getHomeHalloweenEntryProgress(
  userId: string | null,
  nowMs: number,
): Promise<HomeHalloweenEntryProgressData | null> {
  if (!userId || !isHalloweenBestShotOpen(nowMs)) {
    return null;
  }
  try {
    const { data, error } = await createAdminClient()
      .rpc("get_hashtag_campaign_progress", {
        p_campaign_key: HALLOWEEN_BEST_SHOT.campaignKey,
        p_user_id: userId,
      })
      .maybeSingle();
    if (error) {
      console.error("Failed to read the home Halloween entry progress", { code: error.code });
      return null;
    }
    const row = data as ProgressRow | null;
    if (!row?.entered_at) {
      return null;
    }
    return { usedWorks: Math.max(0, Number(row.used_works) || 0) };
  } catch (error) {
    console.error("Failed to read the home Halloween entry progress", error);
    return null;
  }
}

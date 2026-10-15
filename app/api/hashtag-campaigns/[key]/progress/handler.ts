import { connection, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { isHashtagCampaignKey } from "@/features/campaigns/hashtag-campaign/campaign-key";
import type { HashtagCampaignProgressResponse } from "@/features/campaigns/hashtag-campaign/progress";

/**
 * GET /api/hashtag-campaigns/[key]/progress — 企画ページの進捗カード(エントリーと進捗バー)。
 *
 * 期間は DB(hashtag_campaigns)が正本なので、未ログインでも期間だけは返す(viewer: null)。
 * ログイン中なら、使ったちがう応募作の数とエントリーの有無を返す。
 * 数え方は get_hashtag_campaign_progress(抽選の集計も同じ数え方にする)。
 */

export type HashtagCampaignProgressErrorCode =
  | "HASHTAG_CAMPAIGN_NOT_FOUND"
  | "HASHTAG_CAMPAIGN_PROGRESS_FAILED";

type ProgressRow = {
  starts_at: string;
  ends_at: string;
  used_works: number | null;
  entered_at: string | null;
  celebrated_tickets: number | null;
};

export interface HashtagCampaignProgressRouteDependencies {
  getUserFn?: typeof getUser;
  /** 知らない企画なら null。読めなければ例外 */
  fetchProgressFn?: (campaignKey: string, userId: string | null) => Promise<ProgressRow | null>;
}

async function defaultFetchProgress(
  campaignKey: string,
  userId: string | null,
): Promise<ProgressRow | null> {
  const { data, error } = await createAdminClient()
    .rpc("get_hashtag_campaign_progress", {
      p_campaign_key: campaignKey,
      p_user_id: userId,
    })
    .maybeSingle();
  if (error) {
    throw new Error(`get_hashtag_campaign_progress failed: ${error.code}`);
  }
  return (data as ProgressRow | null) ?? null;
}

export async function getHashtagCampaignProgressRoute(
  campaignKey: string,
  dependencies: HashtagCampaignProgressRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const fetchProgressFn = dependencies.fetchProgressFn ?? defaultFetchProgress;

  if (!isHashtagCampaignKey(campaignKey)) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }

  const user = await getUserFn();

  let row: ProgressRow | null;
  try {
    row = await fetchProgressFn(campaignKey, user?.id ?? null);
  } catch (error) {
    console.error("Failed to read hashtag campaign progress", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to read progress", "HASHTAG_CAMPAIGN_PROGRESS_FAILED", 500);
  }
  if (!row) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }

  const body: HashtagCampaignProgressResponse = {
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    viewer: user
      ? {
          enteredAt: row.entered_at ? new Date(row.entered_at).toISOString() : null,
          usedWorks: Math.max(0, Number(row.used_works) || 0),
          celebratedTickets: Math.max(0, Number(row.celebrated_tickets) || 0),
        }
      : null,
  };

  // 本人ごとに違う値なので、共有のキャッシュに載せない
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

export const hashtagCampaignProgressRouteHandlers = {
  async getHashtagCampaignProgressRoute(campaignKey: string) {
    // リクエストごとに動かす(ビルド時に事前生成させない)
    await connection();
    return getHashtagCampaignProgressRoute(campaignKey);
  },
};

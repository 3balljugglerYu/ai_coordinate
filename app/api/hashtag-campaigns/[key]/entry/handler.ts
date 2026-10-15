import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { isHashtagCampaignKey } from "@/features/campaigns/hashtag-campaign/campaign-key";
import type { HashtagCampaignEntryResponse } from "@/features/campaigns/hashtag-campaign/progress";

/**
 * POST /api/hashtag-campaigns/[key]/entry — 企画にエントリーする(2026-10-15 ユーザー決定)。
 *
 * 抽選の対象はエントリーした人だけ。受け付けは期間の終わりまで(始まる前でも受け付ける)。
 * 何度押しても1回分(すでにエントリー済みならその日時を返す)。
 * 期間の判定は DB の enter_hashtag_campaign が持つ(期間の正本は hashtag_campaigns)。
 */

export type HashtagCampaignEntryErrorCode =
  | "HASHTAG_CAMPAIGN_NOT_FOUND"
  | "HASHTAG_CAMPAIGN_AUTH_REQUIRED"
  | "HASHTAG_CAMPAIGN_ENTRY_CLOSED"
  | "HASHTAG_CAMPAIGN_ENTRY_FAILED";

export interface HashtagCampaignEntryRouteDependencies {
  getUserFn?: typeof getUser;
  /** エントリーした日時。受け付けなかった(未エントリーのまま)なら null。読めなければ例外 */
  enterFn?: (campaignKey: string, userId: string) => Promise<string | null>;
}

async function defaultEnter(campaignKey: string, userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("enter_hashtag_campaign", {
    p_campaign_key: campaignKey,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`enter_hashtag_campaign failed: ${error.code}`);
  }
  return typeof data === "string" ? data : null;
}

export async function postHashtagCampaignEntryRoute(
  request: NextRequest,
  campaignKey: string,
  dependencies: HashtagCampaignEntryRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const enterFn = dependencies.enterFn ?? defaultEnter;

  // CSRF 防御: cookie 認証の書き込みなので、先に Origin を確かめる
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  if (!isHashtagCampaignKey(campaignKey)) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }

  const user = await getUserFn();
  if (!user) {
    return jsonError("Login required", "HASHTAG_CAMPAIGN_AUTH_REQUIRED", 401);
  }

  let enteredAt: string | null;
  try {
    enteredAt = await enterFn(campaignKey, user.id);
  } catch (error) {
    console.error("Failed to enter hashtag campaign", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to enter", "HASHTAG_CAMPAIGN_ENTRY_FAILED", 500);
  }
  if (!enteredAt) {
    // 期間が終わった(または知らない企画)。未エントリーのまま
    return jsonError("Entry is closed", "HASHTAG_CAMPAIGN_ENTRY_CLOSED", 409);
  }

  const body: HashtagCampaignEntryResponse = { enteredAt: new Date(enteredAt).toISOString() };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

export const hashtagCampaignEntryRouteHandlers = {
  postHashtagCampaignEntryRoute,
};

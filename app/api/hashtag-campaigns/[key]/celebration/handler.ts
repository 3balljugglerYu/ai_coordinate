import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { isHashtagCampaignKey } from "@/features/campaigns/hashtag-campaign/campaign-key";
import {
  ticketsForWorks,
  type HashtagCampaignCelebrationResponse,
  type TicketTier,
} from "@/features/campaigns/hashtag-campaign/progress";

/**
 * POST /api/hashtag-campaigns/[key]/celebration — 口数のお祝いを出したことを残す(2026-10-17)。
 *
 * お祝いは1口ごとに1回(別の端末でも二度出さない)。どこまで出したかは
 * hashtag_campaign_entries.celebrated_tickets に残す。
 *
 * - エントリーした人だけ。届いていない口数は残さない(数え方は get_hashtag_campaign_progress)
 * - 値は上げるだけ(取り消して減ったあとまた届いても、もう一度は出さない。列の決まり)
 * - 1行だけの書き込みなので RPC にせず、サーバーの service_role で書く
 *   (project-conventions: 複数の表にまたがる処理だけを RPC にする)
 */

export type HashtagCampaignCelebrationErrorCode =
  | "HASHTAG_CAMPAIGN_NOT_FOUND"
  | "HASHTAG_CAMPAIGN_AUTH_REQUIRED"
  | "HASHTAG_CAMPAIGN_INVALID_TICKETS"
  | "HASHTAG_CAMPAIGN_NOT_ENTERED"
  | "HASHTAG_CAMPAIGN_TICKETS_NOT_REACHED"
  | "HASHTAG_CAMPAIGN_CELEBRATION_FAILED";

/** 企画ごとの口数のしきい値(いまはハロウィンだけ) */
const TICKET_TIERS_BY_CAMPAIGN: Readonly<Record<string, readonly TicketTier[]>> = {
  [HALLOWEEN_BEST_SHOT.campaignKey]: HALLOWEEN_BEST_SHOT.tickets,
};

type ProgressRow = {
  used_works: number | null;
  entered_at: string | null;
  celebrated_tickets: number | null;
};

export interface HashtagCampaignCelebrationRouteDependencies {
  getUserFn?: typeof getUser;
  /** 知らない企画なら null。読めなければ例外 */
  fetchProgressFn?: (campaignKey: string, userId: string) => Promise<ProgressRow | null>;
  /** 出した口数を残す(今より大きいときだけ)。書けなければ例外 */
  recordFn?: (campaignKey: string, userId: string, tickets: number) => Promise<void>;
}

async function defaultFetchProgress(
  campaignKey: string,
  userId: string,
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

async function defaultRecord(campaignKey: string, userId: string, tickets: number): Promise<void> {
  const { error } = await createAdminClient()
    .from("hashtag_campaign_entries")
    .update({ celebrated_tickets: tickets })
    .eq("campaign_key", campaignKey)
    .eq("user_id", userId)
    // 上げるだけ。同時に2つ届いても、小さいほうで戻さない
    .lt("celebrated_tickets", tickets);
  if (error) {
    throw new Error(`record hashtag campaign celebration failed: ${error.code}`);
  }
}

async function readTickets(request: NextRequest): Promise<number | null> {
  try {
    const body = (await request.json()) as { tickets?: unknown } | null;
    const tickets = body?.tickets;
    return typeof tickets === "number" && Number.isInteger(tickets) ? tickets : null;
  } catch {
    return null;
  }
}

export async function postHashtagCampaignCelebrationRoute(
  request: NextRequest,
  campaignKey: string,
  dependencies: HashtagCampaignCelebrationRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const fetchProgressFn = dependencies.fetchProgressFn ?? defaultFetchProgress;
  const recordFn = dependencies.recordFn ?? defaultRecord;

  // CSRF 防御: cookie 認証の書き込みなので、先に Origin を確かめる
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const tiers = isHashtagCampaignKey(campaignKey) ? TICKET_TIERS_BY_CAMPAIGN[campaignKey] : undefined;
  if (!tiers) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }

  const user = await getUserFn();
  if (!user) {
    return jsonError("Login required", "HASHTAG_CAMPAIGN_AUTH_REQUIRED", 401);
  }

  const tickets = await readTickets(request);
  const maxTickets = Math.max(...tiers.map((tier) => tier.tickets));
  if (tickets === null || tickets < 1 || tickets > maxTickets) {
    return jsonError("Invalid tickets", "HASHTAG_CAMPAIGN_INVALID_TICKETS", 400);
  }

  let row: ProgressRow | null;
  try {
    row = await fetchProgressFn(campaignKey, user.id);
  } catch (error) {
    console.error("Failed to read hashtag campaign progress for celebration", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to record", "HASHTAG_CAMPAIGN_CELEBRATION_FAILED", 500);
  }
  if (!row) {
    return jsonError("Not found", "HASHTAG_CAMPAIGN_NOT_FOUND", 404);
  }
  if (!row.entered_at) {
    return jsonError("Not entered", "HASHTAG_CAMPAIGN_NOT_ENTERED", 409);
  }
  const reached = ticketsForWorks(Math.max(0, Number(row.used_works) || 0), tiers);
  if (tickets > reached) {
    return jsonError("Tickets not reached", "HASHTAG_CAMPAIGN_TICKETS_NOT_REACHED", 409);
  }

  try {
    await recordFn(campaignKey, user.id, tickets);
  } catch (error) {
    console.error("Failed to record hashtag campaign celebration", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to record", "HASHTAG_CAMPAIGN_CELEBRATION_FAILED", 500);
  }

  const body: HashtagCampaignCelebrationResponse = {
    celebratedTickets: Math.max(tickets, Number(row.celebrated_tickets) || 0),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

export const hashtagCampaignCelebrationRouteHandlers = {
  postHashtagCampaignCelebrationRoute,
};

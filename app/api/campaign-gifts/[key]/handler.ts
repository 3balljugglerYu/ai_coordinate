import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { locales } from "@/i18n/config";
import {
  isCampaignGiftKey,
  type CampaignGiftClaimResult,
  type CampaignGiftStatus,
} from "@/features/campaigns/campaign-gift/campaign-gift";

/**
 * GET  /api/campaign-gifts/[key] — 贈り物を受け取れるか・受け取ったか(ログインしていない人も見られる)
 * POST /api/campaign-gifts/[key] — 贈り物を受け取る(ログイン必須・1人1回)
 *
 * 人はセッションで決める(本文は読まない)。額・期間・1人1回の判定は DB(claim_campaign_gift)が持つ。
 */

export type CampaignGiftErrorCode =
  | "CAMPAIGN_GIFT_NOT_FOUND"
  | "CAMPAIGN_GIFT_AUTH_REQUIRED"
  | "CAMPAIGN_GIFT_FAILED";

type RpcStatus = { open?: unknown; claimed?: unknown; amount?: unknown; expire_at?: unknown };
type RpcClaim = { status?: unknown; amount?: unknown; expire_at?: unknown };

export interface CampaignGiftRouteDependencies {
  getUserFn?: typeof getUser;
  getStatusFn?: (campaignKey: string, userId: string | null) => Promise<RpcStatus>;
  claimFn?: (campaignKey: string, userId: string) => Promise<RpcClaim>;
  revalidateFn?: (userId: string) => void;
}

async function defaultGetStatus(campaignKey: string, userId: string | null): Promise<RpcStatus> {
  const { data, error } = await createAdminClient().rpc("get_campaign_gift_status", {
    p_campaign_key: campaignKey,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`get_campaign_gift_status failed: ${error.code}`);
  }
  return (data ?? {}) as RpcStatus;
}

async function defaultClaim(campaignKey: string, userId: string): Promise<RpcClaim> {
  const { data, error } = await createAdminClient().rpc("claim_campaign_gift", {
    p_campaign_key: campaignKey,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`claim_campaign_gift failed: ${error.code}`);
  }
  return (data ?? {}) as RpcClaim;
}

/**
 * 残高を出している画面のキャッシュ。
 * - 生成の画面(CachedGenerationPercoinBalance)は `${source}-${userId}-${locale}`。
 *   贈り物は日本語の画面だけに出すが、受け取ったあとにほかの言語の画面を開くこともあるので、全部の言語を消す
 * - 直後の router.refresh で新しい残高を出すため、古い値を返さない expire: 0 にする(ガチャ・文字入力と同じ)
 */
const GENERATION_BALANCE_SOURCES = ["style", "free", "coordinate"] as const;

function defaultRevalidate(userId: string): void {
  const tags = [
    `my-page-${userId}`,
    `my-page-credits-${userId}`,
    `challenge-${userId}`,
    ...GENERATION_BALANCE_SOURCES.flatMap((source) => locales.map((locale) => `${source}-${userId}-${locale}`)),
  ];
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" };

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getCampaignGiftRoute(
  campaignKey: string,
  dependencies: CampaignGiftRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const getStatusFn = dependencies.getStatusFn ?? defaultGetStatus;

  if (!isCampaignGiftKey(campaignKey)) {
    return jsonError("Not found", "CAMPAIGN_GIFT_NOT_FOUND", 404);
  }

  const user = await getUserFn();
  let raw: RpcStatus;
  try {
    raw = await getStatusFn(campaignKey, user?.id ?? null);
  } catch (error) {
    console.error("Failed to read campaign gift status", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to read", "CAMPAIGN_GIFT_FAILED", 500);
  }

  const body: CampaignGiftStatus = {
    open: raw.open === true,
    claimed: raw.claimed === true,
    signedIn: Boolean(user),
    amount: toNumberOrNull(raw.amount),
    expireAt: toIsoOrNull(raw.expire_at),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function postCampaignGiftRoute(
  request: NextRequest,
  campaignKey: string,
  dependencies: CampaignGiftRouteDependencies = {},
) {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const claimFn = dependencies.claimFn ?? defaultClaim;
  const revalidateFn = dependencies.revalidateFn ?? defaultRevalidate;

  // CSRF 防御: cookie 認証の書き込みなので、先に Origin を確かめる
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  if (!isCampaignGiftKey(campaignKey)) {
    return jsonError("Not found", "CAMPAIGN_GIFT_NOT_FOUND", 404);
  }

  const user = await getUserFn();
  if (!user) {
    return jsonError("Login required", "CAMPAIGN_GIFT_AUTH_REQUIRED", 401);
  }

  let raw: RpcClaim;
  try {
    raw = await claimFn(campaignKey, user.id);
  } catch (error) {
    console.error("Failed to claim campaign gift", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Failed to claim", "CAMPAIGN_GIFT_FAILED", 500);
  }

  let body: CampaignGiftClaimResult;
  const amount = toNumberOrNull(raw.amount);
  const expireAt = toIsoOrNull(raw.expire_at);
  if (raw.status === "granted" && amount !== null && expireAt !== null) {
    body = { status: "granted", amount, expireAt };
    try {
      revalidateFn(user.id);
    } catch (error) {
      console.error("Failed to revalidate after campaign gift", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (raw.status === "already_claimed") {
    body = { status: "already_claimed" };
  } else if (raw.status === "closed" || raw.status === "not_found") {
    body = { status: "closed" };
  } else {
    console.error("Unexpected campaign gift claim result", { status: String(raw.status) });
    return jsonError("Failed to claim", "CAMPAIGN_GIFT_FAILED", 500);
  }

  return NextResponse.json(body, { headers: NO_STORE });
}

export const campaignGiftRouteHandlers = {
  getCampaignGiftRoute,
  postCampaignGiftRoute,
};

import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const GUEST_SHORT_LIMIT = 2;
const GUEST_DAILY_LIMIT = 3;
const AUTHENTICATED_DAILY_LIMIT = 6;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type StyleGenerateRateLimitReason =
  | "guest_short"
  | "guest_daily"
  | "authenticated_daily";

export type StyleGenerateRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: StyleGenerateRateLimitReason };

export interface StyleGenerateRateLimitStatus {
  authState: StyleUsageAuthState;
  remainingDaily: number | null;
  showRemainingWarning: boolean;
}

interface CheckAndConsumeStyleGenerateRateLimitParams {
  request: NextRequest;
  userId: string | null;
  now?: Date;
}

interface GetStyleGenerateRateLimitStatusParams {
  request: NextRequest;
  userId: string | null;
  now?: Date;
}

function getStyleRateLimitSalt(): string {
  return (
    env.STYLE_RATE_LIMIT_HASH_SALT ||
    env.ACCOUNT_FORFEITURE_HASH_SALT ||
    ""
  );
}

function normalizeClientIp(ip: string): string {
  return ip.trim().toLowerCase();
}

function buildClientIpHash(ip: string): string {
  return createHash("sha256")
    .update(`${normalizeClientIp(ip)}|${getStyleRateLimitSalt()}`, "utf8")
    .digest("hex");
}

function extractClientIp(request: NextRequest): string | null {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find((value) => value.length > 0);

    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return null;
}

async function getAuthenticatedDailyGenerateCount(
  userId: string,
  dailyWindowIso: string
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("style_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("auth_state", "authenticated")
    .eq("event_type", "generate")
    .gte("created_at", dailyWindowIso);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function getGuestGenerateAttemptCounts(
  clientIpHash: string,
  shortWindowIso: string,
  dailyWindowIso: string
): Promise<{ shortCount: number; dailyCount: number }> {
  const supabase = createAdminClient();
  const [
    { count: shortCount, error: shortCountError },
    { count: dailyCount, error: dailyCountError },
  ] = await Promise.all([
    supabase
      .from("style_guest_generate_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_ip_hash", clientIpHash)
      .gte("created_at", shortWindowIso),
    supabase
      .from("style_guest_generate_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_ip_hash", clientIpHash)
      .gte("created_at", dailyWindowIso),
  ]);

  if (shortCountError || dailyCountError) {
    throw shortCountError ?? dailyCountError;
  }

  return {
    shortCount: shortCount ?? 0,
    dailyCount: dailyCount ?? 0,
  };
}

export async function getStyleGenerateRateLimitStatus({
  request,
  userId,
  now = new Date(),
}: GetStyleGenerateRateLimitStatusParams): Promise<StyleGenerateRateLimitStatus> {
  const dailyWindowIso = new Date(now.getTime() - ONE_DAY_MS).toISOString();

  if (userId) {
    const authenticatedDailyCount = await getAuthenticatedDailyGenerateCount(
      userId,
      dailyWindowIso
    );
    const remainingDaily = Math.max(
      0,
      AUTHENTICATED_DAILY_LIMIT - authenticatedDailyCount
    );

    return {
      authState: "authenticated",
      remainingDaily,
      showRemainingWarning: remainingDaily === 2,
    };
  }

  const clientIp = extractClientIp(request);
  if (!clientIp) {
    console.warn("Style guest rate limit status: client IP header was unavailable");
    return {
      authState: "guest",
      remainingDaily: null,
      showRemainingWarning: false,
    };
  }

  const clientIpHash = buildClientIpHash(clientIp);
  const { dailyCount } = await getGuestGenerateAttemptCounts(
    clientIpHash,
    new Date(now.getTime() - ONE_MINUTE_MS).toISOString(),
    dailyWindowIso
  );
  const remainingDaily = Math.max(0, GUEST_DAILY_LIMIT - dailyCount);

  return {
    authState: "guest",
    remainingDaily,
    showRemainingWarning: remainingDaily === 2,
  };
}

export async function checkAndConsumeStyleGenerateRateLimit({
  request,
  userId,
  now = new Date(),
}: CheckAndConsumeStyleGenerateRateLimitParams): Promise<StyleGenerateRateLimitResult> {
  const dailyWindowIso = new Date(now.getTime() - ONE_DAY_MS).toISOString();

  if (userId) {
    const authenticatedDailyCount = await getAuthenticatedDailyGenerateCount(
      userId,
      dailyWindowIso
    );

    if (authenticatedDailyCount >= AUTHENTICATED_DAILY_LIMIT) {
      return { allowed: false, reason: "authenticated_daily" };
    }

    return { allowed: true };
  }

  const clientIp = extractClientIp(request);
  if (!clientIp) {
    console.warn("Style guest rate limit: client IP header was unavailable");
    return { allowed: true };
  }

  const clientIpHash = buildClientIpHash(clientIp);
  const shortWindowIso = new Date(now.getTime() - ONE_MINUTE_MS).toISOString();
  const { shortCount, dailyCount } = await getGuestGenerateAttemptCounts(
    clientIpHash,
    shortWindowIso,
    dailyWindowIso
  );

  if (shortCount >= GUEST_SHORT_LIMIT) {
    return { allowed: false, reason: "guest_short" };
  }

  if (dailyCount >= GUEST_DAILY_LIMIT) {
    return { allowed: false, reason: "guest_daily" };
  }

  const supabase = createAdminClient();
  const { error: insertError } = await supabase
    .from("style_guest_generate_attempts")
    .insert({
      client_ip_hash: clientIpHash,
    });

  if (insertError) {
    throw insertError;
  }

  return { allowed: true };
}

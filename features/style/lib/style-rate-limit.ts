import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const GUEST_SHORT_LIMIT = 2;
const GUEST_DAILY_LIMIT = 2;
const AUTHENTICATED_DAILY_LIMIT = 5;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

export type StyleGenerateRateLimitReason =
  | "guest_short"
  | "guest_daily"
  | "authenticated_daily";

export type StyleAttemptReleaseReason =
  | "upload_failed"
  | "job_create_failed"
  | "queue_failed"
  | "timeout"
  | "upstream_error"
  | "no_image_generated"
  | "worker_failed"
  | "infra_error";

export interface StyleGenerateAttemptReservation {
  authState: StyleUsageAuthState;
  attemptId: string;
}

export type StyleGenerateRateLimitResult =
  | { allowed: true; reservation?: StyleGenerateAttemptReservation | null }
  | { allowed: false; reason: StyleGenerateRateLimitReason };

export interface StyleGenerateRateLimitStatus {
  authState: StyleUsageAuthState;
  remainingDaily: number | null;
  showRemainingWarning: boolean;
}

interface CheckAndConsumeStyleGenerateRateLimitParams {
  request: NextRequest;
  userId: string | null;
  styleId: string;
  now?: Date;
}

interface ReleaseStyleGenerateRateLimitAttemptParams {
  reservation: StyleGenerateAttemptReservation | null | undefined;
  reason: StyleAttemptReleaseReason;
  releasedAt?: Date;
}

interface AttachStyleGenerateRateLimitReservationToJobParams {
  reservation: StyleGenerateAttemptReservation | null | undefined;
  jobId: string;
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

function getJstStartOfDay(now: Date): Date {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  jstNow.setUTCHours(0, 0, 0, 0);
  return new Date(jstNow.getTime() - JST_OFFSET_MS);
}

function shouldShowRemainingWarning(remainingDaily: number | null): boolean {
  return typeof remainingDaily === "number" && remainingDaily <= 2;
}

async function getAuthenticatedDailyGenerateAttemptCount(
  userId: string,
  dailyWindowIso: string
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("style_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("auth_state", "authenticated")
    .eq("event_type", "generate_attempt")
    .is("released_at", null)
    .gte("created_at", dailyWindowIso);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function consumeAuthenticatedGenerateAttempt(params: {
  userId: string;
  styleId: string;
  now: Date;
}): Promise<StyleGenerateRateLimitResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "reserve_style_authenticated_generate_attempt",
    {
      p_user_id: params.userId,
      p_style_id: params.styleId,
      p_daily_limit: AUTHENTICATED_DAILY_LIMIT,
      p_now: params.now.toISOString(),
    }
  );

  if (error) {
    throw error;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid authenticated style rate-limit reservation response");
  }
  const payloadRecord = payload as Record<string, unknown>;

  const allowed = payloadRecord.allowed === true;
  const attemptId =
    typeof payloadRecord.attemptId === "string"
      ? payloadRecord.attemptId
      : typeof payloadRecord.attempt_id === "string"
        ? payloadRecord.attempt_id
        : null;

  if (!allowed) {
    return { allowed: false, reason: "authenticated_daily" };
  }

  return {
    allowed: true,
    reservation:
      attemptId !== null
        ? {
            authState: "authenticated",
            attemptId,
          }
        : null,
  };
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
      .is("released_at", null)
      .gte("created_at", shortWindowIso),
    supabase
      .from("style_guest_generate_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_ip_hash", clientIpHash)
      .is("released_at", null)
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
  const dailyWindowIso = getJstStartOfDay(now).toISOString();

  if (userId) {
    const authenticatedDailyCount = await getAuthenticatedDailyGenerateAttemptCount(
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
      showRemainingWarning: shouldShowRemainingWarning(remainingDaily),
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
    showRemainingWarning: shouldShowRemainingWarning(remainingDaily),
  };
}

export async function checkAndConsumeStyleGenerateRateLimit({
  request,
  userId,
  styleId,
  now = new Date(),
}: CheckAndConsumeStyleGenerateRateLimitParams): Promise<StyleGenerateRateLimitResult> {
  if (userId) {
    return consumeAuthenticatedGenerateAttempt({
      userId,
      styleId,
      now,
    });
  }

  const clientIp = extractClientIp(request);
  if (!clientIp) {
    console.warn("Style guest rate limit: client IP header was unavailable");
    return { allowed: true, reservation: null };
  }

  const supabase = createAdminClient();
  const clientIpHash = buildClientIpHash(clientIp);
  const { data, error } = await supabase.rpc(
    "reserve_style_guest_generate_attempt",
    {
      p_client_ip_hash: clientIpHash,
      p_short_limit: GUEST_SHORT_LIMIT,
      p_daily_limit: GUEST_DAILY_LIMIT,
      p_now: now.toISOString(),
    }
  );

  if (error) {
    throw error;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid guest style rate-limit reservation response");
  }
  const payloadRecord = payload as Record<string, unknown>;

  const allowed = payloadRecord.allowed === true;
  const attemptId =
    typeof payloadRecord.attemptId === "string"
      ? payloadRecord.attemptId
      : typeof payloadRecord.attempt_id === "string"
        ? payloadRecord.attempt_id
        : null;
  const reasonValue =
    typeof payloadRecord.reason === "string" ? payloadRecord.reason : null;

  if (!allowed) {
    return {
      allowed: false,
      reason: reasonValue === "short_limit" ? "guest_short" : "guest_daily",
    };
  }

  return {
    allowed: true,
    reservation:
      attemptId !== null
        ? {
            authState: "guest",
            attemptId,
          }
        : null,
  };
}

export async function attachStyleGenerateRateLimitReservationToJob({
  reservation,
  jobId,
}: AttachStyleGenerateRateLimitReservationToJobParams): Promise<boolean> {
  if (!reservation || reservation.authState !== "authenticated") {
    return false;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "attach_style_authenticated_generate_attempt_job",
    {
      p_attempt_id: reservation.attemptId,
      p_job_id: jobId,
    }
  );

  if (error) {
    throw error;
  }

  return data === true;
}

export async function releaseStyleGenerateRateLimitAttempt({
  reservation,
  reason,
  releasedAt = new Date(),
}: ReleaseStyleGenerateRateLimitAttemptParams): Promise<boolean> {
  if (!reservation) {
    return false;
  }

  const supabase = createAdminClient();

  if (reservation.authState === "authenticated") {
    const { data, error } = await supabase.rpc(
      "release_style_authenticated_generate_attempt",
      {
        p_attempt_id: reservation.attemptId,
        p_release_reason: reason,
        p_released_at: releasedAt.toISOString(),
      }
    );

    if (error) {
      throw error;
    }

    return data === true;
  }

  const { data, error } = await supabase.rpc(
    "release_style_guest_generate_attempt",
    {
      p_attempt_id: reservation.attemptId,
      p_release_reason: reason,
      p_released_at: releasedAt.toISOString(),
    }
  );

  if (error) {
    throw error;
  }

  return data === true;
}

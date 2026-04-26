/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import {
  attachStyleGenerateRateLimitReservationToJob,
  checkAndConsumeStyleGenerateRateLimit,
  getStyleGenerateRateLimitStatus,
  releaseStyleGenerateRateLimitAttempt,
} from "@/features/style/lib/style-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient =
  createAdminClient as jest.MockedFunction<typeof createAdminClient>;

const VALID_GUEST_COOKIE_ID = "11111111-2222-4333-8444-555555555555";

function createRequest(
  options: { ip?: string | null; guestCookieId?: string | null } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  const ip = options.ip === undefined ? "203.0.113.10" : options.ip;
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  const cookieId =
    options.guestCookieId === undefined
      ? VALID_GUEST_COOKIE_ID
      : options.guestCookieId;
  if (cookieId) {
    headers["cookie"] = `persta_guest_id=${cookieId}`;
  }
  return new NextRequest("http://localhost/style/generate", {
    method: "POST",
    headers,
  });
}

function createCountQuery(result: { count: number; error: null }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue(result),
  };
}

describe("style-rate-limit", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("checkAndConsumeStyleGenerateRateLimit_認証ユーザーはRPCで原子的に消費する", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        allowed: true,
        attemptId: "attempt-auth-001",
        reason: null,
      },
      error: null,
    });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest(),
      userId: "user-123",
      styleId: "paris_code",
      now: new Date("2026-03-21T12:34:56.000Z"),
    });

    expect(result).toEqual({
      allowed: true,
      reservation: {
        authState: "authenticated",
        attemptId: "attempt-auth-001",
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      "reserve_style_authenticated_generate_attempt",
      {
        p_user_id: "user-123",
        p_style_id: "paris_code",
        p_daily_limit: 5,
        p_now: "2026-03-21T12:34:56.000Z",
      }
    );
  });

  test("checkAndConsumeStyleGenerateRateLimit_認証ユーザー上限時はauthenticated_dailyを返す", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        allowed: false,
        attemptId: null,
        reason: "daily_limit",
      },
      error: null,
    });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest(),
      userId: "user-123",
      styleId: "paris_code",
      now: new Date("2026-03-21T12:34:56.000Z"),
    });

    expect(result).toEqual({
      allowed: false,
      reason: "authenticated_daily",
    });
  });

  test("getStyleGenerateRateLimitStatus_認証ユーザーの日次残数はJSTの当日0時から集計する", async () => {
    const authenticatedQuery = createCountQuery({ count: 3, error: null });
    const from = jest.fn().mockReturnValue(authenticatedQuery);
    mockCreateAdminClient.mockReturnValue({ from } as never);

    const status = await getStyleGenerateRateLimitStatus({
      request: createRequest(),
      userId: "user-123",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(status).toEqual({
      authState: "authenticated",
      remainingDaily: 2,
      showRemainingWarning: true,
    });
    expect(from).toHaveBeenCalledWith("style_usage_events");
    expect(authenticatedQuery.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-03-21T15:00:00.000Z"
    );
  });

  test("checkAndConsumeStyleGenerateRateLimit_guestの日次上限はJSTの当日0時から判定する", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        allowed: true,
        attemptId: "attempt-guest-001",
        reason: null,
      },
      error: null,
    });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest(),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(result).toEqual({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-guest-001",
      },
    });
    expect(rpc).toHaveBeenCalledWith("reserve_style_guest_generate_attempt", {
      p_client_ip_hash: expect.any(String),
      p_short_limit: 999,
      p_daily_limit: 1,
      p_now: "2026-03-21T15:30:00.000Z",
    });
  });

  test("checkAndConsumeStyleGenerateRateLimit_guestはIP+Cookieのハッシュで識別する", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        allowed: true,
        attemptId: "attempt-guest-002",
        reason: null,
      },
      error: null,
    });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    // Cookie ID が異なれば同じ IP でも別ハッシュになる（ADR-009）
    await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest({ guestCookieId: VALID_GUEST_COOKIE_ID }),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });
    const firstHash =
      rpc.mock.calls[0][1].p_client_ip_hash as string;

    rpc.mockClear();
    await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest({
        guestCookieId: "99999999-aaaa-4bbb-8ccc-dddddddddddd",
      }),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });
    const secondHash =
      rpc.mock.calls[0][1].p_client_ip_hash as string;

    expect(firstHash).toEqual(expect.any(String));
    expect(secondHash).toEqual(expect.any(String));
    expect(firstHash).not.toEqual(secondHash);
  });

  test("checkAndConsumeStyleGenerateRateLimit_guestはIP無しならmissing_identifierで拒否", async () => {
    // RPC は呼ばれてはいけない
    const rpc = jest.fn();
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest({ ip: null }),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(result).toEqual({ allowed: false, reason: "missing_identifier" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("checkAndConsumeStyleGenerateRateLimit_guestはCookie無しならmissing_identifierで拒否", async () => {
    const rpc = jest.fn();
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest({ guestCookieId: null }),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(result).toEqual({ allowed: false, reason: "missing_identifier" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("checkAndConsumeStyleGenerateRateLimit_guestはCookieが不正な値ならmissing_identifierで拒否", async () => {
    const rpc = jest.fn();
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest({ guestCookieId: "not-a-valid-uuid" }),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(result).toEqual({ allowed: false, reason: "missing_identifier" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("getStyleGenerateRateLimitStatus_残数が1回でも注意表示を維持する", async () => {
    const authenticatedQuery = createCountQuery({ count: 4, error: null });
    const from = jest.fn().mockReturnValue(authenticatedQuery);
    mockCreateAdminClient.mockReturnValue({ from } as never);

    const status = await getStyleGenerateRateLimitStatus({
      request: createRequest(),
      userId: "user-123",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(status).toEqual({
      authState: "authenticated",
      remainingDaily: 1,
      showRemainingWarning: true,
    });
  });

  test("attachStyleGenerateRateLimitReservationToJob_認証予約をジョブに紐づける", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    await expect(
      attachStyleGenerateRateLimitReservationToJob({
        reservation: {
          authState: "authenticated",
          attemptId: "attempt-auth-001",
        },
        jobId: "job-001",
      })
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith(
      "attach_style_authenticated_generate_attempt_job",
      {
        p_attempt_id: "attempt-auth-001",
        p_job_id: "job-001",
      }
    );
  });

  test("releaseStyleGenerateRateLimitAttempt_guest予約をreleaseする", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    await expect(
      releaseStyleGenerateRateLimitAttempt({
        reservation: {
          authState: "guest",
          attemptId: "attempt-guest-001",
        },
        reason: "timeout",
        releasedAt: new Date("2026-03-21T15:30:00.000Z"),
      })
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith(
      "release_style_guest_generate_attempt",
      {
        p_attempt_id: "attempt-guest-001",
        p_release_reason: "timeout",
        p_released_at: "2026-03-21T15:30:00.000Z",
      }
    );
  });
});

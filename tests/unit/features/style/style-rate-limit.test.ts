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

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/style/generate", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
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
      p_short_limit: 2,
      p_daily_limit: 2,
      p_now: "2026-03-21T15:30:00.000Z",
    });
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

/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import {
  checkAndConsumeStyleGenerateRateLimit,
  getStyleGenerateRateLimitStatus,
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
    gte: jest.fn().mockResolvedValue(result),
  };
}

describe("style-rate-limit", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("checkAndConsumeStyleGenerateRateLimit_認証ユーザーはRPCで原子的に消費する", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest(),
      userId: "user-123",
      styleId: "paris_code",
      now: new Date("2026-03-21T12:34:56.000Z"),
    });

    expect(result).toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith(
      "consume_style_authenticated_generate_attempt",
      {
        p_user_id: "user-123",
        p_style_id: "paris_code",
        p_daily_limit: 6,
        p_now: "2026-03-21T12:34:56.000Z",
      }
    );
  });

  test("checkAndConsumeStyleGenerateRateLimit_認証ユーザー上限時はauthenticated_dailyを返す", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
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
    const shortQuery = createCountQuery({ count: 0, error: null });
    const dailyQuery = createCountQuery({ count: 2, error: null });
    const insert = jest.fn().mockResolvedValue({ error: null });
    const from = jest
      .fn()
      .mockReturnValueOnce(shortQuery)
      .mockReturnValueOnce(dailyQuery)
      .mockReturnValueOnce({ insert });
    mockCreateAdminClient.mockReturnValue({ from } as never);

    const result = await checkAndConsumeStyleGenerateRateLimit({
      request: createRequest(),
      userId: null,
      styleId: "paris_code",
      now: new Date("2026-03-21T15:30:00.000Z"),
    });

    expect(result).toEqual({ allowed: true });
    expect(from).toHaveBeenNthCalledWith(1, "style_guest_generate_attempts");
    expect(from).toHaveBeenNthCalledWith(2, "style_guest_generate_attempts");
    expect(dailyQuery.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-03-21T15:00:00.000Z"
    );
    expect(insert).toHaveBeenCalled();
  });
});

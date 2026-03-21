/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { checkAndConsumeStyleGenerateRateLimit } from "@/features/style/lib/style-rate-limit";
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
});

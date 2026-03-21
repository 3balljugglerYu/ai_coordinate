/** @jest-environment node */

import { NextRequest } from "next/server";
import { getStyleRateLimitStatusRoute } from "@/app/(app)/style/rate-limit-status/handler";
import type { StyleGenerateRateLimitStatus } from "@/features/style/lib/style-rate-limit";

type JsonRecord = Record<string, unknown>;

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/style/rate-limit-status", {
    method: "GET",
    headers: {
      "accept-language": "ja",
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

describe("StyleRateLimitStatusRoute integration tests", () => {
  let getUserFn: jest.Mock;
  let getRateLimitStatusFn: jest.Mock<
    Promise<StyleGenerateRateLimitStatus>,
    [{ request: NextRequest; userId: string | null }]
  >;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue({ id: "user-123" });
    getRateLimitStatusFn = jest
      .fn<
        Promise<StyleGenerateRateLimitStatus>,
        [{ request: NextRequest; userId: string | null }]
      >()
      .mockResolvedValue({
        authState: "authenticated",
        remainingDaily: 2,
        showRemainingWarning: true,
      });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test("getStyleRateLimitStatusRoute_未認証の場合_guestの残り回数を返す", async () => {
    getUserFn.mockResolvedValueOnce(null);
    getRateLimitStatusFn.mockResolvedValueOnce({
      authState: "guest",
      remainingDaily: 2,
      showRemainingWarning: true,
    });

    const response = await getStyleRateLimitStatusRoute(createRequest(), {
      getUserFn,
      getRateLimitStatusFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      authState: "guest",
      remainingDaily: 2,
      showRemainingWarning: true,
    });
    expect(getRateLimitStatusFn).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      userId: null,
    });
  });

  test("getStyleRateLimitStatusRoute_認証済みの場合_authenticatedの残り回数を返す", async () => {
    const response = await getStyleRateLimitStatusRoute(createRequest(), {
      getUserFn,
      getRateLimitStatusFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      authState: "authenticated",
      remainingDaily: 2,
      showRemainingWarning: true,
    });
    expect(getRateLimitStatusFn).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      userId: "user-123",
    });
  });

  test("getStyleRateLimitStatusRoute_取得失敗時_500を返す", async () => {
    getRateLimitStatusFn.mockRejectedValueOnce(new Error("status failed"));

    const response = await getStyleRateLimitStatusRoute(createRequest(), {
      getUserFn,
      getRateLimitStatusFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "利用回数の確認に失敗しました。少し時間をおいて再試行してください。",
      errorCode: "STYLE_RATE_LIMIT_STATUS_INTERNAL_ERROR",
    });
  });
});

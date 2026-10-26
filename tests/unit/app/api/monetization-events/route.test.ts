/** @jest-environment node */

/**
 * POST /api/monetization-events(画面から、課金の手前の出来事を送る)。
 * 人はログイン中のセッションで決め、本文の user_id は使わない。
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({ ensureSameOrigin: jest.fn(() => null) }));
jest.mock("@/features/monetization/lib/record-monetization-event", () => ({
  recordMonetizationEvent: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/monetization-events/route";
import { getUser } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockRecord = recordMonetizationEvent as jest.MockedFunction<typeof recordMonetizationEvent>;

const USER = "11111111-1111-4111-8111-111111111111";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/monetization-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: USER } as never);
  mockSameOrigin.mockReturnValue(null);
  mockRecord.mockResolvedValue(true);
});

test("ログイン中の人で書き、画面で止めた印(client)を付ける。本文の user_id は使わない", async () => {
  const response = await POST(
    request({ eventType: "percoin_shortage", feature: "generate", required: 20, balance: 5, userId: "other" }),
  );
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ recorded: true });
  expect(mockRecord).toHaveBeenCalledWith({
    userId: USER,
    eventType: "percoin_shortage",
    feature: "generate",
    whereDetected: "client",
    origin: null,
    required: 20,
    balance: 5,
  });
});

test("ログインしていなければ 401 で、書かない", async () => {
  mockGetUser.mockResolvedValue(null as never);
  const response = await POST(request({ eventType: "purchase_view" }));
  expect(response.status).toBe(401);
  expect(mockRecord).not.toHaveBeenCalled();
});

test("別のサイトからは断る", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const response = await POST(request({ eventType: "purchase_view" }));
  expect(response.status).toBe(403);
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRecord).not.toHaveBeenCalled();
});

test("画面から送れない種類(支払いの開始)は 400 で、書かない", async () => {
  const response = await POST(request({ eventType: "checkout_start" }));
  expect(response.status).toBe(400);
  expect(mockRecord).not.toHaveBeenCalled();
});

test("DB が上限で書かなかったときも 200 で recorded: false", async () => {
  mockRecord.mockResolvedValue(false);
  const response = await POST(request({ eventType: "purchase_view" }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ recorded: false });
});

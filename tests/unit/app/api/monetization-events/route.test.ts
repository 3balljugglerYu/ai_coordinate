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
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/monetization-events/route";
import { getUser } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";
import { createAdminClient } from "@/lib/supabase/admin";

const mockAdmin = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

function balanceClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn(async () => result);
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as unknown as ReturnType<
    typeof createAdminClient
  >;
}

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
  mockAdmin.mockReturnValue(balanceClient({ data: { balance: 5 }, error: null }));
});

test("ログイン中の人で書き、画面で止めた印(client)を付ける。本文の user_id と残高は使わない", async () => {
  const response = await POST(
    request({ eventType: "percoin_shortage", feature: "generate", required: 20, balance: 0, userId: "other" }),
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

test("足りなくなった: 本当は足りている(サーバーで読んだ残高が必要な量以上)なら書かない", async () => {
  mockAdmin.mockReturnValue(balanceClient({ data: { balance: 50 }, error: null }));
  const response = await POST(request({ eventType: "percoin_shortage", feature: "generate", required: 20, balance: 0 }));
  await expect(response.json()).resolves.toEqual({ recorded: false });
  expect(mockRecord).not.toHaveBeenCalled();
});

test("足りなくなった: 残高を読めなければ書かない", async () => {
  mockAdmin.mockReturnValue(balanceClient({ data: null, error: { message: "boom" } }));
  const response = await POST(request({ eventType: "percoin_shortage", feature: "generate", required: 20 }));
  await expect(response.json()).resolves.toEqual({ recorded: false });
  expect(mockRecord).not.toHaveBeenCalled();
});

test("購入画面を見た: 残高は読まず、残高なしで書く", async () => {
  await POST(request({ eventType: "purchase_view", origin: "purchase_page" }));
  expect(mockAdmin).not.toHaveBeenCalled();
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ eventType: "purchase_view", balance: null }));
});


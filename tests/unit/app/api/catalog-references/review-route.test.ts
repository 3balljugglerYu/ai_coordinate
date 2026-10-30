/** @jest-environment node */

/**
 * POST /api/catalog-references/review(見本つきの作品を審査に出す)。
 *
 * ここで守ること(計画書 REQ-006・ADR-005):
 *  - よそのサイトからは止める。ログインしていなければ 401。画像の ID の形が違えば 400
 *  - 本人のログインの権限で RPC submit_catalog_review を呼ぶ(本人かどうかは RPC が確かめる)
 *  - RPC の断りを、本人でない 403・見つからない 404・もう申請した 409 に分ける。ほかは 500
 *  - 成功したら状態と申請の時刻を返す
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({ ensureSameOrigin: jest.fn(() => null) }));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/catalog-references/review/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";

const rpc = jest.fn();

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/catalog-references/review", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function rpcResult(result: { data: unknown; error: { code: string; message?: string } | null }) {
  rpc.mockReturnValue({ maybeSingle: jest.fn(async () => result) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSameOrigin.mockReturnValue(null);
  mockGetUser.mockResolvedValue({ id: USER_ID } as Awaited<ReturnType<typeof getUser>>);
  mockCreateClient.mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createClient>>);
  rpcResult({ data: { status: "pending", submitted_at: "2026-10-30T12:00:00Z" }, error: null });
});

test("本人のログインの権限で RPC に画像の ID を渡し、状態と申請の時刻を返す", async () => {
  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "pending", submittedAt: "2026-10-30T12:00:00Z" });
  expect(rpc).toHaveBeenCalledWith("submit_catalog_review", { p_image_id: IMAGE_ID });
});

test("よそのサイトからは、ログインの確認より前に止める", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(403);
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("ログインしていなければ 401", async () => {
  mockGetUser.mockResolvedValue(null);

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  ["画像の ID の形が違う", { imageId: "not-a-uuid" }],
  ["画像の ID が無い", {}],
  ["本文が JSON でない", "not json"],
])("%s → 400", async (_label, body) => {
  const response = await POST(request(body));

  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  ["本人でない(42501)", "42501", 403, "CATALOG_REVIEW_FORBIDDEN"],
  ["見つからない(P0002)", "P0002", 404, "CATALOG_REVIEW_NOT_FOUND"],
  ["もう申請した(22023)", "22023", 409, "CATALOG_REVIEW_ALREADY_SUBMITTED"],
  ["そのほかの失敗", "57014", 500, "CATALOG_REVIEW_SUBMIT_FAILED"],
])("RPC が断った: %s → %p", async (_label, code, status, errorCode) => {
  rpcResult({ data: null, error: { code, message: "x" } });
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
});

/** @jest-environment node */

/**
 * POST /api/catalog-references/review(見本つきの作品を審査に出す)。
 *
 * ここで守ること(計画書 REQ-006・ADR-005):
 *  - よそのサイトからは止める。ログインしていなければ 401。画像の ID の形が違えば 400
 *  - 本人のログインの権限で RPC submit_catalog_review を呼ぶ(本人かどうかは RPC が確かめる)
 *  - RPC の断りを分ける: 見つからない(他人の作品を含む・P0002) 404。「未申請」でない(22023)ときは本人の
 *    審査の行を読み、審査中・承認済み・作り直しを別の 409 にする。ログインの情報が届かない(42501)は 401。ほかは 500
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
const reviewStatus = jest.fn(async () => ({
  data: null as { status: string } | null,
  error: null as { code: string; message: string } | null,
}));
const eq = jest.fn();
const from = jest.fn(() => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (...args: unknown[]) => {
    eq(...args);
    return chain;
  };
  chain.maybeSingle = reviewStatus;
  return chain;
});

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
  mockCreateClient.mockResolvedValue({ rpc, from } as unknown as Awaited<ReturnType<typeof createClient>>);
  reviewStatus.mockResolvedValue({ data: null, error: null });
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
  ["ログインの情報が届かない(42501)", "42501", 401, "CATALOG_REVIEW_AUTH_REQUIRED"],
  ["見つからない・他人の作品(P0002)", "P0002", 404, "CATALOG_REVIEW_NOT_FOUND"],
  ["そのほかの失敗", "57014", 500, "CATALOG_REVIEW_SUBMIT_FAILED"],
])("RPC が断った: %s → %p", async (_label, code, status, errorCode) => {
  rpcResult({ data: null, error: { code, message: "x" } });
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
});

test.each([
  ["審査中", "pending", "CATALOG_REVIEW_ALREADY_SUBMITTED"],
  ["承認済み", "approved", "CATALOG_REVIEW_ALREADY_APPROVED"],
  ["作り直し(出し直せない)", "rejected", "CATALOG_REVIEW_REJECTED"],
])("「未申請」でない(22023)ときは、本人の審査の行を読んで分ける: %s → 409 %s", async (_label, reviewState, errorCode) => {
  rpcResult({ data: null, error: { code: "22023", message: "CATALOG_REVIEW_INVALID_STATE" } });
  reviewStatus.mockResolvedValue({ data: { status: reviewState }, error: null });

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(from).toHaveBeenCalledWith("generated_image_catalog_reviews");
  expect(eq).toHaveBeenCalledWith("image_id", IMAGE_ID);
});

test("「未申請」でないのに審査の行を読めなければ、審査中と決めつけず 500", async () => {
  rpcResult({ data: null, error: { code: "22023", message: "CATALOG_REVIEW_INVALID_STATE" } });
  reviewStatus.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toMatchObject({ errorCode: "CATALOG_REVIEW_SUBMIT_FAILED" });
});

test("見本が使えなくなっていれば(作り直し・元の作品の削除)、状態を読み直さずに 409 REFERENCE_UNAVAILABLE", async () => {
  rpcResult({ data: null, error: { code: "22023", message: "CATALOG_REVIEW_REFERENCE_UNAVAILABLE" } });
  reviewStatus.mockResolvedValue({ data: { status: "not_submitted" }, error: null });

  const response = await POST(request({ imageId: IMAGE_ID }));

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ errorCode: "CATALOG_REVIEW_REFERENCE_UNAVAILABLE" });
  expect(from).not.toHaveBeenCalled();
});

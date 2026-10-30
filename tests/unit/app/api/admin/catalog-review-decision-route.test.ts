/** @jest-environment node */

/**
 * POST /api/admin/catalog-reviews/[imageId]/decision(見本つきの作品の審査の判定)。
 *
 * ここで守ること(計画書 REQ-007):
 *  - 運営だけ。よそのサイトからは止める
 *  - 承認か、作り直し(理由の分類が要る・説明は文字の数で500文字まで・「そのほか」は説明も要る)。それ以外は 400
 *  - 判定はログイン中の運営として RPC apply_catalog_review_decision に渡す(通知は RPC が作る)
 *  - RPC の断りを、見つからない 404・もう判定した 409・作品が使えない 409・運営でない 403 に分ける
 *  - 判定できたら監査ログに残す。断られたら残さない
 */

jest.mock("@/lib/auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({ ensureSameOrigin: jest.fn(() => null) }));
jest.mock("@/lib/admin-audit", () => ({ logAdminAction: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/admin/catalog-reviews/[imageId]/decision/route";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockAudit = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const rpc = jest.fn();

function rpcResult(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  rpc.mockReturnValue({ maybeSingle: jest.fn(async () => result) });
}

function request(body: unknown, imageId = IMAGE_ID) {
  return POST(
    new NextRequest(`http://localhost/api/admin/catalog-reviews/${imageId}/decision`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ imageId }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSameOrigin.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as Awaited<ReturnType<typeof requireAdmin>>);
  mockAdminClient.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
  rpcResult({ data: { status: "approved", reviewed_at: "2026-10-30T12:00:00Z" }, error: null });
});

test("承認: ログイン中の運営として RPC に渡し、監査ログに残す", async () => {
  const response = await request({ action: "approve" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "approved", reviewedAt: "2026-10-30T12:00:00Z" });
  expect(rpc).toHaveBeenCalledWith("apply_catalog_review_decision", {
    p_image_id: IMAGE_ID,
    p_admin_id: ADMIN_ID,
    p_action: "approve",
    p_reason_category: null,
    p_reason: null,
  });
  expect(mockAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      adminUserId: ADMIN_ID,
      actionType: "catalog_review_approve",
      targetType: "generated_image_catalog_reviews",
      targetId: IMAGE_ID,
    }),
  );
});

test("作り直し: 理由の分類と説明(前後の空白を除く)を渡し、監査ログに分類と説明を残す", async () => {
  rpcResult({ data: { status: "rejected", reviewed_at: "2026-10-30T12:00:00Z" }, error: null });

  const response = await request({ action: "reject", reasonCategory: "real_person", reason: "  実在の俳優です  " });

  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "apply_catalog_review_decision",
    expect.objectContaining({ p_action: "reject", p_reason_category: "real_person", p_reason: "実在の俳優です" }),
  );
  expect(mockAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      actionType: "catalog_review_reject",
      metadata: { reasonCategory: "real_person", reason: "実在の俳優です" },
    }),
  );
});

test("運営でなければ 403 で、判定しない", async () => {
  mockRequireAdmin.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const response = await request({ action: "approve" });

  expect(response.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test("よそのサイトからは、運営の確認より前に止める", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const response = await request({ action: "approve" });

  expect(response.status).toBe(403);
  expect(mockRequireAdmin).not.toHaveBeenCalled();
});

test.each([
  ["作品の ID の形が違う", { action: "approve" }, "bad-id"],
  ["作り直しに理由の分類が無い", { action: "reject" }, IMAGE_ID],
  ["理由の分類が決まりに無い", { action: "reject", reasonCategory: "ugly" }, IMAGE_ID],
  ["説明が500文字を超える", { action: "reject", reasonCategory: "other", reason: "あ".repeat(501) }, IMAGE_ID],
  ["「そのほか」なのに説明が無い", { action: "reject", reasonCategory: "other" }, IMAGE_ID],
  ["「そのほか」なのに説明が空白だけ", { action: "reject", reasonCategory: "other", reason: "   " }, IMAGE_ID],
  ["判定が決まりに無い", { action: "unpublish" }, IMAGE_ID],
  ["本文が JSON でない", "not json", IMAGE_ID],
])("%s → 400 で判定しない", async (_label, body, imageId) => {
  const response = await request(body, imageId);

  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(mockAudit).not.toHaveBeenCalled();
});

test.each([
  ["見つからない", { code: "P0002", message: "CATALOG_REVIEW_NOT_FOUND" }, 404, "CATALOG_REVIEW_NOT_FOUND"],
  ["もう判定した", { code: "22023", message: "CATALOG_REVIEW_INVALID_STATE" }, 409, "CATALOG_REVIEW_ALREADY_DECIDED"],
  ["作品が使えない", { code: "22023", message: "CATALOG_REVIEW_IMAGE_UNAVAILABLE" }, 409, "CATALOG_REVIEW_IMAGE_UNAVAILABLE"],
  ["見本が作り直しで止まっている", { code: "22023", message: "CATALOG_REVIEW_REFERENCE_UNAVAILABLE" }, 409, "CATALOG_REVIEW_REFERENCE_UNAVAILABLE"],
  ["運営として登録されていない", { code: "42501", message: "CATALOG_REVIEW_UNAUTHORIZED" }, 403, "CATALOG_REVIEW_UNAUTHORIZED"],
  ["そのほかの失敗", { code: "57014", message: "timeout" }, 500, "CATALOG_REVIEW_DECISION_FAILED"],
])("RPC が断った(%s)ら、状態と理由を返し、監査ログに残さない", async (_label, error, status, errorCode) => {
  rpcResult({ data: null, error });
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await request({ action: "approve" });

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(mockAudit).not.toHaveBeenCalled();
});

test("説明は文字の数で数える(絵文字500文字は通す)", async () => {
  rpcResult({ data: { status: "rejected", reviewed_at: "2026-10-30T12:00:00Z" }, error: null });

  const response = await request({ action: "reject", reasonCategory: "other", reason: "😀".repeat(500) });

  expect(response.status).toBe(200);
});

test("「そのほか」以外は、説明が無くても作り直しにできる(監査ログの説明は null)", async () => {
  rpcResult({ data: { status: "rejected", reviewed_at: "2026-10-30T12:00:00Z" }, error: null });

  const response = await request({ action: "reject", reasonCategory: "sexual_or_violent" });

  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("apply_catalog_review_decision", expect.objectContaining({ p_reason: null }));
  expect(mockAudit).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: { reasonCategory: "sexual_or_violent", reason: null } }),
  );
});

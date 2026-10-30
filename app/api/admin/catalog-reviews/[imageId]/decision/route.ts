import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { jsonError } from "@/lib/api/json-error";
import { isUuid } from "@/lib/is-uuid";
import { CATALOG_REVIEW_REASON_CATEGORIES } from "@/features/catalog-references/lib/review-reasons";

const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reasonCategory: z.enum(CATALOG_REVIEW_REASON_CATEGORIES),
    reason: z.string().max(500).optional().nullable(),
  }),
]);

/**
 * POST /api/admin/catalog-reviews/[imageId]/decision: 見本つきの作品の審査を判定する。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 4・REQ-007)
 *
 * - 運営だけ。よそのサイトからは止める
 * - 承認(approve)か、作り直し(reject・理由の分類が要る・説明は500文字まで)
 * - 判定・通知の作成は DB の RPC apply_catalog_review_decision が1つのトランザクションで行う
 * - 監査ログに残す(catalog_review_approve / catalog_review_reject)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { imageId } = await params;
  if (!isUuid(imageId)) {
    return jsonError("作品の ID が不正です", "CATALOG_REVIEW_INVALID_ID", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("入力が不正です", "CATALOG_REVIEW_INVALID_REQUEST", 400);
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("判定の内容が不正です(作り直しには理由の分類が必要です)", "CATALOG_REVIEW_INVALID_DECISION", 400);
  }
  const decision = parsed.data;
  const reason = decision.action === "reject" ? decision.reason?.trim() || null : null;

  const { data, error } = await createAdminClient()
    .rpc("apply_catalog_review_decision", {
      p_image_id: imageId,
      p_admin_id: adminUser.id,
      p_action: decision.action,
      p_reason_category: decision.action === "reject" ? decision.reasonCategory : null,
      p_reason: reason,
    })
    .maybeSingle();

  if (error) {
    const message = error.message ?? "";
    if (error.code === "P0002") {
      return jsonError("審査の作品が見つかりません", "CATALOG_REVIEW_NOT_FOUND", 404);
    }
    if (message.includes("CATALOG_REVIEW_INVALID_STATE")) {
      return jsonError("この作品はもう判定されています", "CATALOG_REVIEW_ALREADY_DECIDED", 409);
    }
    if (message.includes("CATALOG_REVIEW_IMAGE_UNAVAILABLE")) {
      return jsonError("作品が公開停止などで使えないため、承認できません", "CATALOG_REVIEW_IMAGE_UNAVAILABLE", 409);
    }
    if (error.code === "42501") {
      return jsonError("運営として登録されていません", "CATALOG_REVIEW_UNAUTHORIZED", 403);
    }
    console.error("[admin catalog-reviews] decision error:", error.code, message);
    return jsonError("判定に失敗しました", "CATALOG_REVIEW_DECISION_FAILED", 500);
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: decision.action === "approve" ? "catalog_review_approve" : "catalog_review_reject",
    targetType: "generated_image_catalog_reviews",
    targetId: imageId,
    metadata:
      decision.action === "reject"
        ? { reasonCategory: decision.reasonCategory, hasReason: reason !== null }
        : {},
  });

  const row = data as { status?: string; reviewed_at?: string | null } | null;
  return NextResponse.json({ status: row?.status ?? null, reviewedAt: row?.reviewed_at ?? null });
}

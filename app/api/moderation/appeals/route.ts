import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAppealSchema } from "@/features/moderation/lib/schemas";
import {
  insertAppealAsOwner,
  resolveAppealPreconditions,
} from "@/features/moderation/lib/appeal-repository";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getModerationRouteCopy } from "@/features/moderation/lib/route-copy";
import { ensureSameOrigin } from "@/lib/security/same-origin";

/**
 * POST /api/moderation/appeals
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-004 / REQ-007, REQ-008, REQ-009
 *
 * - `appellant_id` は**サーバー側セッションから解決**する。リクエストボディからは
 *   受け取らない（なりすまし防止）
 * - 対象は投稿ではなく個々の公開停止判定（`moderation_audit_logs.id`）
 * - 所有者・removed 状態・期限は API で検証して 4xx を返す。DB 側にも
 *   guard trigger があるため二重防御になっている
 */
export async function POST(request: NextRequest) {
  const copy = getModerationRouteCopy(getRouteLocale(request));

  try {
    const originGuard = ensureSameOrigin(request);
    if (originGuard) return originGuard;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "APPEAL_AUTH_REQUIRED", 401);
    }

    const payload = createAppealSchema.safeParse(await request.json());
    if (!payload.success) {
      return jsonError(copy.invalidRequest, "APPEAL_INVALID_REQUEST", 400);
    }

    const { moderationDecisionId, body } = payload.data;
    const adminClient = createAdminClient();

    const preconditions = await resolveAppealPreconditions(
      moderationDecisionId,
      user.id,
      adminClient
    );

    if (!preconditions.ok) {
      switch (preconditions.reason) {
        case "already_exists":
          return jsonError(copy.appealAlreadyExists, "APPEAL_ALREADY_EXISTS", 409);
        case "expired":
          return jsonError(copy.appealDeadlinePassed, "APPEAL_DEADLINE_PASSED", 409);
        case "not_removed":
          return jsonError(copy.appealNotApplicable, "APPEAL_NOT_APPLICABLE", 409);
        default:
          // 他人の判定も「存在しない」として扱う（REQ-014）
          return jsonError(copy.appealNotFound, "APPEAL_NOT_FOUND", 404);
      }
    }

    const inserted = await insertAppealAsOwner({
      postId: preconditions.postId,
      decisionId: moderationDecisionId,
      userId: user.id,
      body,
      deadline: preconditions.deadline,
      sessionClientOverride: supabase,
    });

    if (!inserted.ok) {
      if (inserted.duplicate) {
        return jsonError(copy.appealAlreadyExists, "APPEAL_ALREADY_EXISTS", 409);
      }
      return jsonError(copy.appealCreateFailed, "APPEAL_CREATE_FAILED", 500);
    }

    return NextResponse.json({
      appealId: inserted.appealId,
      status: "pending",
      appealDeadlineAt: preconditions.deadline,
    });
  } catch (error) {
    console.error("Appeal create API error:", error);
    return jsonError(copy.appealCreateFailed, "APPEAL_CREATE_FAILED", 500);
  }
}

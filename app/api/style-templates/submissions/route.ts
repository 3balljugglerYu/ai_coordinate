import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, isInspireSubmitterAllowed } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const promoteSchema = z.object({
  templateId: z.string().uuid(),
  copyrightConsent: z.literal(true).superRefine((val, ctx) => {
    if (val !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "copyrightConsent must be true",
      });
    }
  }),
});

/**
 * POST /api/style-templates/submissions
 *
 * draft 状態のテンプレートを pending に昇格する（申請確定）。
 * クライアントは copyrightConsent=true を必須で送る（DB 側でも CHECK 制約があるが、
 * UX エラーメッセージのため API 層でも検証）。
 *
 * cap (5 件) 超過は DB 側のトリガが check_violation を返すので 429 として扱う。
 * REQ-S-06 / REQ-S-07 / REQ-S-10 / REQ-S-11 参照
 */
export async function POST(request: NextRequest) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  if (!isInspireFeatureEnabled()) {
    return jsonError(copy.notConfigured, "INSPIRE_DISABLED", 404);
  }

  const user = await getUser();
  if (!user) {
    return jsonError(copy.authRequired, "INSPIRE_AUTH_REQUIRED", 401);
  }

  if (!isInspireSubmitterAllowed(user.id)) {
    return jsonError(
      copy.submitterNotAllowed,
      "INSPIRE_SUBMISSION_NOT_ALLOWED",
      403
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_REQUEST", 400);
  }

  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message === "copyrightConsent must be true"
        ? copy.consentRequired
        : copy.invalidRequest;
    return jsonError(message, "INSPIRE_INVALID_REQUEST", 400);
  }

  const adminClient = createAdminClient();
  const { data: success, error } = await adminClient.rpc(
    "promote_user_style_template_draft",
    {
      p_template_id: parsed.data.templateId,
      p_actor_id: user.id,
      p_metadata: { source: "api", consent_given: true },
    }
  );

  if (error) {
    const message = error.message ?? "";
    if (message.includes("user_style_template_submission_cap_exceeded")) {
      return jsonError(copy.capExceeded, "INSPIRE_SUBMISSION_CAP_EXCEEDED", 429);
    }
    if (message.includes("user_style_template_not_found_or_not_owner")) {
      return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
    }
    if (message.includes("user_style_template_missing_image")) {
      return jsonError(
        copy.promotionMissingImage,
        "INSPIRE_TEMPLATE_MISSING_IMAGE",
        400
      );
    }
    if (message.includes("user_style_template_not_in_draft")) {
      return jsonError(copy.promotionFailed, "INSPIRE_TEMPLATE_NOT_DRAFT", 409);
    }
    console.error("[submissions POST] RPC failed", error);
    return jsonError(copy.promotionFailed, "INSPIRE_PROMOTION_FAILED", 500);
  }

  if (!success) {
    return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
  }

  return NextResponse.json({ success: true, template_id: parsed.data.templateId });
}

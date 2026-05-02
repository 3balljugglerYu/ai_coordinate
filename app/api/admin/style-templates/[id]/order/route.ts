import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const orderSchema = z.object({
  display_order: z.number().int().min(0).max(100000),
});

/**
 * PATCH /api/admin/style-templates/[id]/order
 *
 * 管理者がテンプレ単体の display_order を更新する。
 * バルク並び替えは別 API を用意せず、UI から複数回叩いて反映する想定（Phase 5 で見直し可能）。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_ID", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_REQUEST", 400);
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_REQUEST", 400);
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("user_style_templates")
    .update({ display_order: parsed.data.display_order })
    .eq("id", id);

  if (error) {
    console.error("[admin order PATCH] failed", error);
    return jsonError(
      copy.orderUpdateFailed,
      "INSPIRE_ORDER_UPDATE_FAILED",
      500
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "style_template_order_update",
    targetType: "style_template",
    targetId: id,
    metadata: { display_order: parsed.data.display_order },
  });

  try {
    revalidateTag("home-user-style-templates", "max");
  } catch (err) {
    console.warn("[admin order PATCH] revalidateTag failed (non-fatal)", err);
  }

  return NextResponse.json({
    success: true,
    display_order: parsed.data.display_order,
  });
}

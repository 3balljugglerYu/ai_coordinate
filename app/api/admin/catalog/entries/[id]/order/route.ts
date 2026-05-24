import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  getEntryByIdAdmin,
  updateEntryOrder,
} from "@/features/catalog/lib/admin-repository";
import { catalogCampaignTag } from "@/features/catalog/lib/get-public-catalog";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const orderSchema = z.object({
  display_order: z.number().int().min(0).max(100000),
});

/**
 * PATCH /api/admin/catalog/entries/[id]/order
 * 本のページ順 (display_order) を更新する。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const adminClient = createAdminClient();
  const { data: entry } = await getEntryByIdAdmin(adminClient, id);
  if (!entry) {
    return jsonError(copy.entryNotFound, "CATALOG_ENTRY_NOT_FOUND", 404);
  }

  const { error } = await updateEntryOrder(
    adminClient,
    id,
    parsed.data.display_order,
  );
  if (error) {
    console.error("[admin catalog entry order PATCH] failed", error);
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_ORDER_FAILED", 500);
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_entry_reorder",
    targetType: "catalog_entry",
    targetId: id,
    metadata: { display_order: parsed.data.display_order },
  });

  try {
    const { data: campaign } = await adminClient
      .from("catalog_campaigns")
      .select("slug")
      .eq("id", entry.campaign_id)
      .maybeSingle();
    if (campaign?.slug) {
      revalidateTag(catalogCampaignTag(campaign.slug), "max");
    }
  } catch (err) {
    console.warn(
      "[admin catalog entry order PATCH] revalidate failed",
      err,
    );
  }

  return NextResponse.json({ success: true });
}

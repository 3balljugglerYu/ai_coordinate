import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  deleteCampaign,
  updateCampaign,
} from "@/features/catalog/lib/admin-repository";
import {
  CATALOG_CACHE_TAGS,
  catalogCampaignTag,
} from "@/features/catalog/lib/get-public-catalog";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  cover_storage_path: z.string().max(500).optional().nullable(),
  theme_hashtag: z.string().max(40).optional().nullable(),
  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const adminClient = createAdminClient();
  const { data, error } = await updateCampaign(adminClient, id, parsed.data);
  if (error || !data) {
    console.error("[admin catalog campaign PATCH] failed", error);
    return jsonError(
      copy.campaignNotFound,
      "CATALOG_ADMIN_UPDATE_FAILED",
      404,
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_campaign_update",
    targetType: "catalog_campaign",
    targetId: id,
    metadata: parsed.data,
  });

  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
    revalidateTag(catalogCampaignTag(data.slug), "max");
  } catch (err) {
    console.warn("[admin catalog campaign PATCH] revalidate failed", err);
  }

  return NextResponse.json({ campaign: data });
}

export async function DELETE(
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
  const adminClient = createAdminClient();

  const { error } = await deleteCampaign(adminClient, id);
  if (error) {
    console.error("[admin catalog campaign DELETE] failed", error);
    return jsonError(
      copy.invalidRequest,
      "CATALOG_ADMIN_DELETE_FAILED",
      500,
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_campaign_delete",
    targetType: "catalog_campaign",
    targetId: id,
  });

  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
  } catch (err) {
    console.warn("[admin catalog campaign DELETE] revalidate failed", err);
  }

  return NextResponse.json({ success: true });
}

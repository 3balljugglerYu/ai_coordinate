import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createCampaign,
  listCampaignsAdmin,
} from "@/features/catalog/lib/admin-repository";
import { CATALOG_CACHE_TAGS } from "@/features/catalog/lib/get-public-catalog";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createSchema = z.object({
  slug: z.string().min(1).max(80).regex(SLUG_PATTERN),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  cover_storage_path: z.string().max(500).optional().nullable(),
  theme_hashtag: z.string().max(40).optional().nullable(),
  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
});

export async function GET(request: NextRequest) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const url = request.nextUrl;
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "draft" || statusParam === "published"
      ? statusParam
      : undefined;

  const adminClient = createAdminClient();
  const { data, error } = await listCampaignsAdmin(adminClient, { status });
  if (error) {
    console.error("[admin catalog campaigns GET] failed", error);
    return jsonError(copy.listFetchFailed, "CATALOG_ADMIN_LIST_FAILED", 500);
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const adminClient = createAdminClient();
  const { data, error } = await createCampaign(adminClient, parsed.data);
  if (error || !data) {
    console.error("[admin catalog campaigns POST] failed", error);
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_CREATE_FAILED", 500);
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_campaign_create",
    targetType: "catalog_campaign",
    targetId: data.id,
    metadata: { slug: data.slug },
  });

  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
  } catch (err) {
    console.warn("[admin catalog campaigns POST] revalidate failed", err);
  }

  return NextResponse.json({ campaign: data });
}

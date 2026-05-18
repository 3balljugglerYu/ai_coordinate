import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listEntriesAdmin,
} from "@/features/catalog/lib/admin-repository";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

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
    statusParam === "pending" ||
    statusParam === "approved" ||
    statusParam === "rejected"
      ? statusParam
      : undefined;
  const campaignId = url.searchParams.get("campaign_id") ?? undefined;

  const adminClient = createAdminClient();
  const { data, error } = await listEntriesAdmin(adminClient, {
    status,
    campaignId,
  });
  if (error) {
    console.error("[admin catalog entries GET] failed", error);
    return jsonError(copy.listFetchFailed, "CATALOG_ADMIN_LIST_FAILED", 500);
  }

  const rows = data ?? [];
  const paths = rows.map((r) => r.image_storage_path);
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const items = rows.map((row) => ({
    ...row,
    image_url: pathToUrl.get(row.image_storage_path) ?? null,
  }));

  return NextResponse.json({
    items,
    signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
  });
}

/**
 * 公開バナー一覧API（ホーム表示用）
 * 認証不要、キャッシュあり
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicBanners } from "@/features/banners/lib/get-banners";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getBannersRouteCopy } from "@/features/banners/lib/route-copy";

export async function GET(request: NextRequest) {
  const copy = getBannersRouteCopy(getRouteLocale(request));

  try {
    const banners = await getPublicBanners();
    return NextResponse.json(banners);
  } catch (error) {
    console.error("[API /banners] Error:", error);
    return jsonError(copy.fetchFailed, "BANNERS_FETCH_FAILED", 500);
  }
}

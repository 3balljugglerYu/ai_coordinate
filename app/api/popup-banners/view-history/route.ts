import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPopupBannersRouteCopy } from "@/features/popup-banners/lib/route-copy";
import { listPopupBannerViewHistory } from "@/features/popup-banners/lib/popup-banner-view-repository";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

export async function GET(request: NextRequest) {
  await connection();
  const copy = getPopupBannersRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "POPUP_BANNERS_AUTH_REQUIRED", 401);
    }

    const supabase = await createClient();
    const history = await listPopupBannerViewHistory(supabase, user.id);
    return NextResponse.json(history);
  } catch (error) {
    console.error("[API /popup-banners/view-history] Error:", error);
    return jsonError(
      copy.historyFetchFailed,
      "POPUP_BANNERS_HISTORY_FETCH_FAILED",
      500
    );
  }
}

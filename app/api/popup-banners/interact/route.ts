import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";
import { popupBannerInteractSchema } from "@/features/popup-banners/lib/schema";
import { getPopupBannersRouteCopy } from "@/features/popup-banners/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

export async function POST(request: NextRequest) {
  const copy = getPopupBannersRouteCopy(getRouteLocale(request));

  try {
    const payload = popupBannerInteractSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return jsonError(
        copy.invalidRequest,
        "POPUP_BANNERS_INVALID_REQUEST",
        400
      );
    }

    const user = await getUser();
    const clientIpHash = user ? null : getPopupBannerClientIpHash(request);

    if (!user && !clientIpHash) {
      console.warn(
        "[API /popup-banners/interact] Guest interaction skipped because client IP was unavailable"
      );
      return NextResponse.json({ success: true });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.rpc("record_popup_banner_interaction", {
      p_banner_id: payload.data.banner_id,
      p_user_id: user?.id ?? null,
      p_action_type: payload.data.action_type,
      p_client_ip_hash: clientIpHash,
    });

    if (error) {
      console.error("[API /popup-banners/interact] RPC error:", error);

      if (error.message.includes("dismiss_forever is only allowed")) {
        return jsonError(
          copy.dismissForeverForbidden,
          "POPUP_BANNERS_DISMISS_FOREVER_FORBIDDEN",
          400
        );
      }

      if (error.message.includes("Popup banner not found")) {
        return jsonError(copy.notFound, "POPUP_BANNERS_NOT_FOUND", 404);
      }

      if (error.message.includes("Invalid popup banner action type")) {
        return jsonError(
          copy.invalidAction,
          "POPUP_BANNERS_INVALID_ACTION",
          400
        );
      }

      return jsonError(
        copy.interactFailed,
        "POPUP_BANNERS_INTERACT_FAILED",
        500
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /popup-banners/interact] Error:", error);
    return jsonError(
      copy.interactFailed,
      "POPUP_BANNERS_INTERACT_FAILED",
      500
    );
  }
}

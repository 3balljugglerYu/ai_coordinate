import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";

export async function POST(request: NextRequest) {
  const copy = getAccountRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ACCOUNT_AUTH_REQUIRED", 401);
    }
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("cancel_account_deletion", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("cancel_account_deletion error:", error);
      return jsonError(copy.reactivateFailed, "ACCOUNT_REACTIVATE_FAILED", 500);
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return NextResponse.json({
      success: true,
      status: row?.status ?? "reactivated",
    });
  } catch (error) {
    console.error("Account reactivate route error:", error);
    return jsonError(copy.reactivateFailed, "ACCOUNT_REACTIVATE_FAILED", 500);
  }
}

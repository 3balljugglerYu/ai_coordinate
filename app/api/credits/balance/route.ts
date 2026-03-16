import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCreditsRouteCopy } from "@/features/credits/lib/route-copy";

export async function GET(request: NextRequest) {
  const copy = getCreditsRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "CREDITS_AUTH_REQUIRED", 401);
    }

    const { data, error } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to retrieve percoin balance:", error);
      return jsonError(copy.balanceFetchFailed, "CREDITS_BALANCE_FETCH_FAILED", 500);
    }

    return NextResponse.json({ balance: data?.balance ?? 0 });
  } catch (error) {
    console.error("Percoin balance route error:", error);
    return jsonError(copy.balanceFetchFailed, "CREDITS_BALANCE_FETCH_FAILED", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCoordinateStocksRouteCopy } from "@/features/generation/lib/coordinate-stocks-route-copy";
import { getCoordinateStocksUnreadStateForUser } from "@/features/generation/lib/coordinate-stocks-repository";

export async function GET(request: NextRequest) {
  const copy = getCoordinateStocksRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(
        copy.authRequired,
        "COORDINATE_STOCKS_AUTH_REQUIRED",
        401
      );
    }

    const state = await getCoordinateStocksUnreadStateForUser(user.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error("[CoordinateStocks] GET unread state error:", error);
    return jsonError(
      copy.unreadStateFailed,
      "COORDINATE_STOCKS_UNREAD_STATE_FAILED",
      500
    );
  }
}

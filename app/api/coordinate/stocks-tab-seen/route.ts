import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCoordinateStocksRouteCopy } from "@/features/generation/lib/coordinate-stocks-route-copy";
import { markCoordinateStocksTabSeenForUser } from "@/features/generation/lib/coordinate-stocks-repository";

export async function POST(request: NextRequest) {
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

    const seenAt = await markCoordinateStocksTabSeenForUser(user.id);
    return NextResponse.json({ success: true, seenAt });
  } catch (error) {
    console.error("[CoordinateStocks] POST tab-seen error:", error);
    return jsonError(
      copy.markSeenFailed,
      "COORDINATE_STOCKS_MARK_SEEN_FAILED",
      500
    );
  }
}

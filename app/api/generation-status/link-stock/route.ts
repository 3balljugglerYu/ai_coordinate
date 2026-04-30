import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCoordinateStocksRouteCopy } from "@/features/generation/lib/coordinate-stocks-route-copy";
import { COORDINATE_STOCKS_LINK_MAX_JOBS } from "@/features/generation/lib/coordinate-stocks-constants";
import { linkStockToImageJobsForUser } from "@/features/generation/lib/coordinate-stocks-repository";

const linkStockRequestSchema = z.object({
  stockId: z.string().uuid(),
  jobIds: z.array(z.string().uuid()).min(1).max(COORDINATE_STOCKS_LINK_MAX_JOBS),
});

export async function PATCH(request: NextRequest) {
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

    const payload = linkStockRequestSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return jsonError(
        copy.invalidRequest,
        "COORDINATE_STOCKS_INVALID_REQUEST",
        400
      );
    }

    const result = await linkStockToImageJobsForUser({
      userId: user.id,
      stockId: payload.data.stockId,
      jobIds: payload.data.jobIds,
    });

    if ("error" in result) {
      if (result.error === "stock_not_found") {
        return jsonError(
          copy.stockNotFound,
          "COORDINATE_STOCKS_STOCK_NOT_FOUND",
          404
        );
      }
      return jsonError(
        copy.tooManyJobs,
        "COORDINATE_STOCKS_TOO_MANY_JOBS",
        400
      );
    }

    return NextResponse.json({
      success: true,
      updatedJobIds: result.updatedJobIds,
      updatedGeneratedImageIds: result.updatedGeneratedImageIds,
    });
  } catch (error) {
    console.error("[CoordinateStocks] PATCH link-stock error:", error);
    return jsonError(
      copy.linkStockFailed,
      "COORDINATE_STOCKS_LINK_STOCK_FAILED",
      500
    );
  }
}

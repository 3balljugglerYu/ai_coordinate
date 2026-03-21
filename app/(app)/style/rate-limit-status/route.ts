import { NextRequest } from "next/server";
import { styleRateLimitStatusRouteHandlers } from "@/app/(app)/style/rate-limit-status/handler";

export async function GET(request: NextRequest) {
  return styleRateLimitStatusRouteHandlers.getStyleRateLimitStatusRoute(request);
}

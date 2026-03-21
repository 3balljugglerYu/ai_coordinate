import { NextRequest, NextResponse } from "next/server";
import {
  getStyleGenerateRateLimitStatus,
  type StyleGenerateRateLimitStatus,
} from "@/features/style/lib/style-rate-limit";
import { getAllMessages } from "@/i18n/messages";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getUser } from "@/lib/auth";

interface StyleRateLimitStatusRouteDependencies {
  getUserFn?: typeof getUser;
  getRateLimitStatusFn?: (params: {
    request: NextRequest;
    userId: string | null;
  }) => Promise<StyleGenerateRateLimitStatus>;
}

function jsonError(message: string, errorCode: string, status: number) {
  return NextResponse.json({ error: message, errorCode }, { status });
}

export async function getStyleRateLimitStatusRoute(
  request: NextRequest,
  dependencies: StyleRateLimitStatusRouteDependencies = {}
) {
  const locale = getRouteLocale(request);
  const copy = (await getAllMessages(locale)).style;

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const getRateLimitStatusFn =
      dependencies.getRateLimitStatusFn ?? getStyleGenerateRateLimitStatus;

    const user = await getUserFn();
    const status = await getRateLimitStatusFn({
      request,
      userId: user?.id ?? null,
    });

    return NextResponse.json(status);
  } catch (error) {
    console.error("Style rate limit status route error", error);
    return jsonError(
      copy.guestRateLimitCheckFailed,
      "STYLE_RATE_LIMIT_STATUS_INTERNAL_ERROR",
      500
    );
  }
}

export const styleRateLimitStatusRouteHandlers = {
  getStyleRateLimitStatusRoute,
};

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";
import {
  getSubscriptionChangeErrorCode,
  getSubscriptionChangeErrorStatus,
  resumeSubscriptionCancellation,
} from "@/features/subscription/lib/change-service";

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const result = await resumeSubscriptionCancellation({ userId: user.id });

    return NextResponse.json(result);
  } catch (error) {
    const code = getSubscriptionChangeErrorCode(error);
    const status = getSubscriptionChangeErrorStatus(error);
    const message =
      code === "ACTIVE_SUBSCRIPTION_NOT_FOUND"
        ? copy.activeSubscriptionNotFound
        : code === "PENDING_CANCELLATION_NOT_FOUND"
          ? copy.pendingCancellationNotFound
          : copy.resumeCancellationFailed;

    console.error("[Subscription] Resume cancellation failed:", error);
    return jsonError(message, code, status);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";
import {
  cancelScheduledSubscriptionChange,
  getSubscriptionChangeErrorCode,
  getSubscriptionChangeErrorStatus,
} from "@/features/subscription/lib/change-service";

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const result = await cancelScheduledSubscriptionChange({
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = getSubscriptionChangeErrorCode(error);
    const status = getSubscriptionChangeErrorStatus(error);
    const message =
      code === "ACTIVE_SUBSCRIPTION_NOT_FOUND"
        ? copy.activeSubscriptionNotFound
        : code === "SCHEDULED_CHANGE_NOT_FOUND"
          ? copy.scheduledChangeNotFound
          : copy.scheduledChangeCancelFailed;

    console.error("[Subscription] Cancel scheduled change failed:", error);
    return jsonError(message, code, status);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";
import {
  changeSubscriptionPlan,
  getSubscriptionChangeErrorCode,
  getSubscriptionChangeErrorStatus,
} from "@/features/subscription/lib/change-service";

const changeBodySchema = z.object({
  planId: z.enum(["light", "standard", "premium"]),
  billingInterval: z.enum(["month", "year"]),
  confirmedIntervalChange: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const body = await request.json().catch(() => null);
    const parsed = changeBodySchema.safeParse(body);

    if (!parsed.success) {
      const invalidInterval = parsed.error.issues.some(
        (issue) => issue.path[0] === "billingInterval"
      );
      return jsonError(
        invalidInterval ? copy.invalidBillingInterval : copy.invalidPlan,
        invalidInterval
          ? "SUBSCRIPTION_INVALID_BILLING_INTERVAL"
          : "SUBSCRIPTION_INVALID_PLAN",
        400
      );
    }

    const result = await changeSubscriptionPlan({
      userId: user.id,
      targetPlan: parsed.data.planId,
      targetBillingInterval: parsed.data.billingInterval,
      confirmedIntervalChange: parsed.data.confirmedIntervalChange === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = getSubscriptionChangeErrorCode(error);
    const status = getSubscriptionChangeErrorStatus(error);
    const message =
      code === "ACTIVE_SUBSCRIPTION_NOT_FOUND"
        ? copy.activeSubscriptionNotFound
        : code === "NO_CHANGE_REQUESTED"
          ? copy.noChangeRequested
          : code === "INTERVAL_CONFIRMATION_REQUIRED"
            ? copy.intervalConfirmationRequired
            : code === "SUBSCRIPTION_PAYMENT_FAILED"
              ? copy.changePaymentFailed
              : copy.changePrepareFailed;

    console.error("[Subscription] Change request failed:", error);
    return jsonError(message, code, status);
  }
}

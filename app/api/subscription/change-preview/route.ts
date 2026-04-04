import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";
import {
  createSubscriptionChangePreview,
  getSubscriptionChangeErrorCode,
  getSubscriptionChangeErrorStatus,
} from "@/features/subscription/lib/change-service";

const previewBodySchema = z.object({
  planId: z.enum(["light", "standard", "premium"]),
  billingInterval: z.enum(["month", "year"]),
});

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const body = await request.json().catch(() => null);
    const parsed = previewBodySchema.safeParse(body);

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

    const preview = await createSubscriptionChangePreview({
      userId: user.id,
      targetPlan: parsed.data.planId,
      targetBillingInterval: parsed.data.billingInterval,
    });

    return NextResponse.json(preview);
  } catch (error) {
    const code = getSubscriptionChangeErrorCode(error);
    const status = getSubscriptionChangeErrorStatus(error);

    const message =
      code === "ACTIVE_SUBSCRIPTION_NOT_FOUND"
        ? copy.activeSubscriptionNotFound
        : code === "NO_CHANGE_REQUESTED"
          ? copy.noChangeRequested
          : copy.previewPrepareFailed;

    console.error("[Subscription] Change preview failed:", error);
    return jsonError(message, code, status);
  }
}

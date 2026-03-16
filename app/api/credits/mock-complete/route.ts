import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPercoinPackage } from "@/features/credits/percoin-packages";
import { recordMockPercoinPurchase } from "@/features/credits/lib/percoin-service";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCreditsRouteCopy } from "@/features/credits/lib/route-copy";

export async function POST(request: NextRequest) {
  const copy = getCreditsRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "CREDITS_AUTH_REQUIRED", 401);
    }

    const body = await request.json().catch(() => null);
    const packageId = body?.packageId as string | undefined;

    if (!packageId) {
      return jsonError(copy.packageIdRequired, "CREDITS_PACKAGE_ID_REQUIRED", 400);
    }

    const percoinPackage = findPercoinPackage(packageId);
    if (!percoinPackage) {
      return jsonError(copy.invalidPackage, "CREDITS_PACKAGE_NOT_FOUND", 404);
    }

    // purchase_promo は service_role のみ許可のため createAdminClient を使用
    const result = await recordMockPercoinPurchase({
      userId: user.id,
      percoinPackage,
      supabaseClient: createAdminClient(),
    });

    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-credits-${user.id}`, "max");
    revalidateTag(`coordinate-${user.id}`, "max");

    return NextResponse.json({
      success: true,
      balance: result.balance,
      package: percoinPackage,
    });
  } catch (error) {
    console.error("Mock purchase completion error:", error);
    return jsonError(copy.mockPurchaseFailed, "CREDITS_MOCK_PURCHASE_FAILED", 500);
  }
}

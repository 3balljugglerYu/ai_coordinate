import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPercoinPackage } from "@/features/credits/percoin-packages";
import { recordMockPercoinPurchase } from "@/features/credits/lib/percoin-service";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const packageId = body?.packageId as string | undefined;

    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required" },
        { status: 400 }
      );
    }

    const percoinPackage = findPercoinPackage(packageId);
    if (!percoinPackage) {
      return NextResponse.json(
        { error: "Invalid percoin package" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Failed to complete mock purchase" },
      { status: 500 }
    );
  }
}

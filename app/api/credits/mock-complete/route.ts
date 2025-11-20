import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findCreditPackage } from "@/features/credits/credit-packages";
import { recordMockCreditPurchase } from "@/features/credits/lib/credit-service";

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

    const creditPackage = findCreditPackage(packageId);
    if (!creditPackage) {
      return NextResponse.json(
        { error: "Invalid credit package" },
        { status: 404 }
      );
    }

    const result = await recordMockCreditPurchase({
      userId: user.id,
      creditPackage,
      supabaseClient: supabase,
    });

    return NextResponse.json({
      success: true,
      balance: result.balance,
      package: creditPackage,
    });
  } catch (error) {
    console.error("Mock purchase completion error:", error);
    return NextResponse.json(
      { error: "Failed to complete mock purchase" },
      { status: 500 }
    );
  }
}



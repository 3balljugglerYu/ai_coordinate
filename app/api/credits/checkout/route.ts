import { NextRequest, NextResponse } from "next/server";
import { findCreditPackage } from "@/features/credits/credit-packages";

/**
 * クレジット購入用のCheckoutセッションを作成
 * Stripe承認前はモードをmockとして動作させる
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const packageId = body?.packageId as string | undefined;
    const successUrl = body?.successUrl as string | undefined;
    const cancelUrl = body?.cancelUrl as string | undefined;

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

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    // Stripeが利用できない場合はモックモードで擬似的に成功させる
    if (!stripeSecretKey) {
      const redirectUrl = successUrl || "/my-page";
      return NextResponse.json({
        mode: "mock",
        checkoutUrl: `${redirectUrl}?mockPurchase=1&packageId=${encodeURIComponent(
          packageId
        )}`,
        package: creditPackage,
      });
    }

    // TODO: Stripe承認後にCheckoutセッションを作成する実装を追加
    return NextResponse.json(
      {
        mode: "stripe",
        error: "Stripe integration is not yet implemented",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("Checkout creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe webhookエンドポイント
 * Stripe承認前はモックとして200レスポンスのみ返す
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn("Stripe webhook secret is not configured. Returning mock response.");
    return NextResponse.json({ mode: "mock", handled: true });
  }

  // TODO: Stripe承認後にWebhook検証・処理を実装する
  return NextResponse.json(
    {
      mode: "stripe",
      error: "Stripe webhook handling is not yet implemented",
    },
    { status: 501 }
  );
}



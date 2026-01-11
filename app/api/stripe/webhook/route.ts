import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { env, isStripeTestMode } from "@/lib/env";
import { getPercoinsFromPriceId, STRIPE_PRICE_ID_TO_PERCOINS } from "@/features/credits/lib/stripe-price-mapping";
import { recordPercoinPurchase } from "@/features/credits/lib/percoin-service";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Stripe webhookエンドポイント
 * checkout.session.completedイベントを処理してクレジットを付与
 */
export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = env.STRIPE_SECRET_KEY;

  // 環境変数が設定されていない場合はモックモード
  if (!webhookSecret || !stripeSecretKey) {
    console.warn(
      "Stripe webhook secret or secret key is not configured. Returning mock response."
    );
    return NextResponse.json({ mode: "mock", handled: true });
  }

  let stripe: Stripe;
  try {
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
    });
  } catch (error) {
    console.error("Failed to initialize Stripe:", error);
    return NextResponse.json(
      { error: "Failed to initialize Stripe" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("Missing stripe-signature header");
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    // Webhook署名の検証
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log(`[Stripe Webhook] Received event: ${event.type} (id: ${event.id})`);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // checkout.session.completedイベントの処理
  if (event.type === "checkout.session.completed") {
    console.log(`[Stripe Webhook] Processing checkout.session.completed event`);
    try {
      const session = event.data.object as Stripe.Checkout.Session;

      // デバッグ用: セッション全体の情報をログに出力（重要情報のみ）
      console.log(`[Stripe Webhook] Session ID: ${session.id}`);
      console.log(`[Stripe Webhook] client_reference_id: ${session.client_reference_id}`);
      console.log(`[Stripe Webhook] payment_intent: ${typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id}`);
      console.log(`[Stripe Webhook] amount_total: ${session.amount_total}`);
      console.log(`[Stripe Webhook] currency: ${session.currency}`);

      // ユーザーIDの取得（client_reference_idから）
      const userId = session.client_reference_id;
      if (!userId) {
        console.error("Missing client_reference_id in checkout session", {
          sessionId: session.id,
          amountTotal: session.amount_total,
          currency: session.currency,
        });
        return NextResponse.json(
          { error: "Missing client_reference_id" },
          { status: 400 }
        );
      }

      // Payment Intent IDの取得
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      if (!paymentIntentId) {
        console.error("Missing payment_intent in checkout session", {
          sessionId: session.id,
        });
        return NextResponse.json(
          { error: "Missing payment_intent" },
          { status: 400 }
        );
      }

      // line_itemsを展開してPrice IDを取得
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        {
          expand: ["data.price"],
        }
      );

      if (!lineItems.data || lineItems.data.length === 0) {
        console.error("Missing line_items in checkout session", {
          sessionId: session.id,
        });
        return NextResponse.json(
          { error: "Missing line_items" },
          { status: 400 }
        );
      }

      // 最初のline_itemからPrice IDを取得
      const priceId =
        typeof lineItems.data[0].price === "string"
          ? lineItems.data[0].price
          : lineItems.data[0].price?.id;

      if (!priceId) {
        console.error("Missing price ID in checkout session", {
          sessionId: session.id,
        });
        return NextResponse.json(
          { error: "Missing price ID" },
          { status: 400 }
        );
      }

      // デバッグ用: line_itemの詳細情報をログに出力
      console.log(`[Stripe Webhook] Line item details:`, {
        priceId,
        amount: lineItems.data[0].amount_total,
        quantity: lineItems.data[0].quantity,
        description: lineItems.data[0].description,
      });

      // Price IDからペルコイン数を取得
      console.log(`[Stripe Webhook] Price ID: ${priceId}`);
      const percoins = getPercoinsFromPriceId(priceId);
      console.log(`[Stripe Webhook] Percoins amount: ${percoins}`);

      // Price IDが見つからない場合は、即座にエラーとして処理を中断
      if (!percoins) {
        const amountTotal = lineItems.data[0].amount_total || session.amount_total || 0;
        const currency = session.currency || lineItems.data[0].price?.currency || 'jpy';
        
        console.error(`[Stripe Webhook] ❌ Unknown price ID: ${priceId}. This must be added to the price mapping.`, {
          sessionId: session.id,
          priceId,
          amountTotal,
          currency,
          availablePriceIds: Object.keys(STRIPE_PRICE_ID_TO_PERCOINS),
        });
        
        return NextResponse.json(
          { error: `Unknown price ID: ${priceId}. Please add this to the mapping table.` },
          { status: 400 }
        );
      }

      // べき等性チェック: 既に処理済みのpayment_intent_idか確認
      const supabase = await createServerSupabaseClient();
      const { data: existingTransaction } = await supabase
        .from("credit_transactions")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (existingTransaction) {
        console.log(
          `Payment intent ${paymentIntentId} already processed. Skipping.`
        );
        return NextResponse.json({
          received: true,
          handled: true,
          idempotent: true,
          message: "Already processed",
        });
      }

      // クレジット付与（べき等性はデータベースレベルで保証される）
      const customerEmail =
        typeof session.customer === "string"
          ? null
          : session.customer && "email" in session.customer
          ? session.customer.email
          : null;

      console.log(`[Stripe Webhook] Attempting to credit ${percoins} percoins to user ${userId}`);
      try {
        await recordPercoinPurchase({
          userId,
          percoinAmount: percoins,
          stripePaymentIntentId: paymentIntentId,
          metadata: {
            priceId,
            checkoutSessionId: session.id,
            customerEmail,
            mode: isStripeTestMode() ? "test" : "live",
          },
          supabaseClient: supabase,
        });

        console.log(`[Stripe Webhook] ✅ Successfully credited ${percoins} percoins to user ${userId}`, {
          sessionId: session.id,
          paymentIntentId,
          priceId,
        });
      } catch (purchaseError) {
        console.error(`[Stripe Webhook] ❌ Failed to credit percoins:`, purchaseError);
        throw purchaseError;
      }

      return NextResponse.json({
        received: true,
        handled: true,
        userId,
        percoins,
        paymentIntentId,
      });
    } catch (error) {
      console.error("Error processing checkout.session.completed:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }

  // その他のイベントタイプは処理しない（ただし200を返す）
  console.log(`Unhandled event type: ${event.type}`);
  return NextResponse.json({
    received: true,
    handled: false,
    eventType: event.type,
  });
}

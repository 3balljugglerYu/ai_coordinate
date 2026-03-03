import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  findPercoinPackage,
  getStripeImageUrls,
} from "@/features/credits/percoin-packages";
import { env } from "@/lib/env";

const checkoutBodySchema = z.object({
  packageId: z.string().min(1, "packageId is required"),
});

/**
 * Stripeエラーを適切なHTTPレスポンスに変換
 */
function handleStripeError(error: unknown): NextResponse {
  if (!(error instanceof Stripe.errors.StripeError)) {
    console.error("Checkout creation error (non-Stripe):", error);
    return NextResponse.json(
      { error: "決済の準備中にエラーが発生しました。しばらく時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }

  const stripeError = error as Stripe.errors.StripeError;
  const message = stripeError.message ?? "不明なエラーが発生しました";
  const requestId = stripeError.requestId;

  // ログには詳細を記録（requestIdはStripeサポートで有用）
  console.error("[Stripe Checkout] Error:", {
    type: stripeError.type,
    rawType: stripeError.rawType,
    message,
    statusCode: stripeError.statusCode,
    requestId,
    param: stripeError.param,
  });

  // エラー種別に応じたHTTPステータスとレスポンス
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    // 無効なパラメータ（Price ID不正、必須項目欠落など）
    return NextResponse.json(
      { error: `リクエストの内容に問題があります。${message}` },
      { status: 400 }
    );
  }

  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    // APIキー不正（設定ミス）
    return NextResponse.json(
      { error: "決済の設定に問題があります。管理者にお問い合わせください。" },
      { status: 500 }
    );
  }

  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。" },
      { status: 429 }
    );
  }

  if (
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeConnectionError
  ) {
    return NextResponse.json(
      { error: "決済サービスに接続できません。しばらく時間をおいて再度お試しください。" },
      { status: 503 }
    );
  }

  if (error instanceof Stripe.errors.StripePermissionError) {
    return NextResponse.json(
      { error: "この操作は許可されていません。" },
      { status: 403 }
    );
  }

  if (error instanceof Stripe.errors.StripeIdempotencyError) {
    return NextResponse.json(
      { error: "同じリクエストが重複しています。ページを更新して再度お試しください。" },
      { status: 409 }
    );
  }

  // その他のStripeエラー
  return NextResponse.json(
    { error: message },
    { status: (stripeError.statusCode ?? 500) >= 500 ? 503 : 400 }
  );
}

/**
 * ペルコイン購入用のCheckoutセッションを作成
 * 自前UI + Checkout Session API で5つすべてのパッケージを表示可能
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = checkoutBodySchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "packageId is required";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { packageId } = parsed.data;
    const percoinPackage = findPercoinPackage(packageId);
    if (!percoinPackage) {
      return NextResponse.json(
        { error: "指定されたパッケージが見つかりません" },
        { status: 404 }
      );
    }

    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const baseUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const successRedirect = `${baseUrl.replace(/\/$/, "")}/my-page`;
    const cancelRedirect = `${baseUrl.replace(/\/$/, "")}/my-page/credits/purchase`;

    // Stripeが利用できない場合はモックモードで擬似的に成功させる
    if (!stripeSecretKey) {
      return NextResponse.json({
        mode: "mock",
        checkoutUrl: `${successRedirect}?mockPurchase=1&packageId=${encodeURIComponent(
          packageId
        )}`,
        package: percoinPackage,
      });
    }

    // 認証チェックとStripe初期化を並列実行（async-parallel）
    const [authResult, stripe] = await Promise.all([
      createClient().then((supabase) => supabase.auth.getUser()),
      Promise.resolve(new Stripe(stripeSecretKey, { apiVersion: "2025-12-15.clover" })),
    ]);

    const {
      data: { user },
      error: authError,
    } = authResult;

    if (authError || !user) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    // price_data + product_data.images でStripe Checkout画面にも画像を表示
    const stripeImageUrls = getStripeImageUrls(
      percoinPackage.imageUrl,
      baseUrl
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jpy",
            unit_amount: percoinPackage.priceYen,
            product_data: {
              name: percoinPackage.name,
              description: percoinPackage.description ?? undefined,
              images: stripeImageUrls.length > 0 ? stripeImageUrls : undefined,
            },
          },
          quantity: 1,
        },
      ],
      client_reference_id: user.id,
      success_url: successRedirect,
      cancel_url: cancelRedirect,
      metadata: {
        packageId: percoinPackage.id,
        percoinAmount: String(percoinPackage.credits),
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout URLの作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mode: "stripe",
      checkoutUrl: session.url,
      package: percoinPackage,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return handleStripeError(error);
    }
    console.error("Checkout creation error (non-Stripe):", error);
    return NextResponse.json(
      {
        error: "決済の準備中にエラーが発生しました。しばらく時間をおいて再度お試しください。",
      },
      { status: 500 }
    );
  }
}

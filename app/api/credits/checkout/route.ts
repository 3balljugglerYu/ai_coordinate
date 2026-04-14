import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { ROUTES } from "@/constants";
import { createClient } from "@/lib/supabase/server";
import {
  findPercoinPackage,
  getStripeImageUrls,
} from "@/features/credits/percoin-packages";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getCreditsRouteCopy } from "@/features/credits/lib/route-copy";

const checkoutBodySchema = z.object({
  packageId: z.string().min(1, "packageId is required"),
});

function handleStripeError(
  error: unknown,
  copy: ReturnType<typeof getCreditsRouteCopy>
): NextResponse {
  if (!(error instanceof Stripe.errors.StripeError)) {
    console.error("Checkout creation error (non-Stripe):", error);
    return jsonError(copy.checkoutPrepareFailed, "CREDITS_CHECKOUT_PREPARE_FAILED", 500);
  }

  const stripeError = error as Stripe.errors.StripeError;
  const message = stripeError.message ?? copy.checkoutPrepareFailed;
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
    return jsonError(
      `${copy.checkoutInvalidRequest} ${message}`.trim(),
      "CREDITS_CHECKOUT_INVALID_REQUEST",
      400
    );
  }

  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    return jsonError(copy.checkoutConfigError, "CREDITS_CHECKOUT_CONFIG_ERROR", 500);
  }

  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return jsonError(copy.checkoutRateLimited, "CREDITS_CHECKOUT_RATE_LIMITED", 429);
  }

  if (
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeConnectionError
  ) {
    return jsonError(
      copy.checkoutServiceUnavailable,
      "CREDITS_CHECKOUT_SERVICE_UNAVAILABLE",
      503
    );
  }

  if (error instanceof Stripe.errors.StripePermissionError) {
    return jsonError(copy.checkoutPermissionDenied, "CREDITS_CHECKOUT_PERMISSION_DENIED", 403);
  }

  if (error instanceof Stripe.errors.StripeIdempotencyError) {
    return jsonError(copy.checkoutDuplicateRequest, "CREDITS_CHECKOUT_DUPLICATE_REQUEST", 409);
  }

  return jsonError(
    message || copy.checkoutPrepareFailed,
    "CREDITS_CHECKOUT_STRIPE_ERROR",
    (stripeError.statusCode ?? 500) >= 500 ? 503 : 400
  );
}

/**
 * ペルコイン購入用のCheckoutセッションを作成
 * 自前UI + Checkout Session API で5つすべてのパッケージを表示可能
 */
export async function POST(request: NextRequest) {
  const copy = getCreditsRouteCopy(getRouteLocale(request));

  try {
    const body = await request.json().catch(() => null);
    const parsed = checkoutBodySchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(copy.packageIdRequired, "CREDITS_PACKAGE_ID_REQUIRED", 400);
    }

    const { packageId } = parsed.data;
    const percoinPackage = findPercoinPackage(packageId);
    if (!percoinPackage) {
      return jsonError(copy.invalidPackage, "CREDITS_PACKAGE_NOT_FOUND", 404);
    }

    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const baseUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const successRedirect = `${normalizedBaseUrl}${ROUTES.CREDITS_PURCHASE}?success=true`;
    const cancelRedirect = `${normalizedBaseUrl}${ROUTES.CREDITS_PURCHASE}?canceled=true`;

    // Stripeが利用できない場合はモックモードで擬似的に成功させる
    if (!stripeSecretKey) {
      return NextResponse.json({
        mode: "mock",
        checkoutUrl: `${successRedirect}&mockPurchase=1&packageId=${encodeURIComponent(
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
      return jsonError(copy.checkoutLoginRequired, "CREDITS_AUTH_REQUIRED", 401);
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
      return jsonError(copy.checkoutUrlFailed, "CREDITS_CHECKOUT_URL_FAILED", 500);
    }

    return NextResponse.json({
      mode: "stripe",
      checkoutUrl: session.url,
      package: percoinPackage,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return handleStripeError(error, copy);
    }
    console.error("Checkout creation error (non-Stripe):", error);
    return jsonError(copy.checkoutPrepareFailed, "CREDITS_CHECKOUT_PREPARE_FAILED", 500);
  }
}

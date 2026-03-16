import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deductPercoins,
  InsufficientPercoinBalanceError,
} from "@/features/credits/lib/percoin-service";
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
    const generationId = body?.generationId as string | undefined;
    const percoins = Number(body?.credits);

    if (!generationId || Number.isNaN(percoins) || percoins <= 0) {
      return jsonError(copy.invalidConsumeRequest, "CREDITS_INVALID_CONSUME_REQUEST", 400);
    }

    // 生成した画像が本人のものか確認
    const { data: imageRecord, error: imageError } = await supabase
      .from("generated_images")
      .select("id, user_id")
      .eq("id", generationId)
      .single();

    if (imageError || !imageRecord) {
      return jsonError(copy.imageNotFound, "CREDITS_IMAGE_NOT_FOUND", 404);
    }

    if (imageRecord.user_id !== user.id) {
      return jsonError(copy.forbidden, "CREDITS_FORBIDDEN", 403);
    }

    const result = await deductPercoins({
      userId: user.id,
      percoinAmount: percoins,
      relatedGenerationId: generationId,
      metadata: { reason: "image_generation" },
      supabaseClient: supabase,
    });

    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-credits-${user.id}`, "max");
    revalidateTag(`coordinate-${user.id}`, "max");
    return NextResponse.json({ balance: result.balance });
  } catch (error) {
    console.error("Percoin consumption error:", error);
    if (error instanceof InsufficientPercoinBalanceError) {
      return jsonError(copy.insufficientBalance, "CREDITS_INSUFFICIENT_BALANCE", 409);
    }
    return jsonError(copy.consumeFailed, "CREDITS_CONSUME_FAILED", 500);
  }
}

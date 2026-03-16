import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getTutorialRouteCopy } from "@/features/tutorial/lib/route-copy";

/**
 * チュートリアル完了API
 * grant_tour_bonus RPC を呼び出して20ペルコインを付与し、
 * user_metadata.tutorial_completed を true に更新する
 */
export async function POST(request: NextRequest) {
  const copy = getTutorialRouteCopy(getRouteLocale(request));

  try {
    // 独立した操作を並列実行（async-api-routes）
    const [user, supabase] = await Promise.all([getUser(), createClient()]);

    if (!user) {
      return jsonError(copy.authRequired, "TUTORIAL_AUTH_REQUIRED", 401);
    }

    // rpc の成功後に updateUser を実行し、データ不整合を防止
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "grant_tour_bonus",
      { p_user_id: user.id }
    );
    if (rpcError) {
      console.error("[Tutorial Complete] RPC error:", rpcError);
      return jsonError(copy.tutorialCompleteFailed, "TUTORIAL_COMPLETE_FAILED", 500);
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    const amountGranted = typeof result?.amount_granted === "number" ? result.amount_granted : 0;
    const alreadyCompleted = result?.already_completed === true;

    const { error: updateError } = await supabase.auth.updateUser({
      data: { tutorial_completed: true },
    });
    if (updateError) {
      console.error("[Tutorial Complete] Failed to update user metadata:", updateError);
      // ペルコイン付与は成功済みのため、エラーでも200を返す
    }

    revalidateTag(`challenge-${user.id}`, "max");
    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-credits-${user.id}`, "max");
    revalidateTag(`coordinate-${user.id}`, "max");
    return NextResponse.json({
      success: true,
      amount_granted: amountGranted,
      already_completed: alreadyCompleted,
    });
  } catch (error) {
    console.error("[Tutorial Complete] Exception:", error);
    return jsonError(copy.tutorialCompleteFailed, "TUTORIAL_COMPLETE_FAILED", 500);
  }
}

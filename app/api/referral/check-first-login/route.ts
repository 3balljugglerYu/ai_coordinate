import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReferralCheckReasonCode } from "@/features/referral/types";

const REFERRAL_REASON_CODES = [
  "granted",
  "already_granted",
  "window_expired",
  "missing_code",
  "invalid_code",
  "transient_error",
  "unauthorized",
] as const;

function isReferralCheckReasonCode(
  value: unknown
): value is ReferralCheckReasonCode {
  return (
    typeof value === "string" &&
    (REFERRAL_REASON_CODES as readonly string[]).includes(value)
  );
}

/**
 * 初回ログイン時の紹介特典チェックAPI
 * メールアドレス確認完了後の初回ログイン成功時に呼び出される
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    const referralCode = request.nextUrl.searchParams.get("ref");

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          reason_code: "unauthorized" as ReferralCheckReasonCode,
          error: "認証が必要です",
        },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "check_and_grant_referral_bonus_on_first_login_with_reason",
      {
        p_user_id: user.id,
        p_referral_code: referralCode,
      }
    );

    if (rpcError) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("[Referral Bonus] RPC error:", rpcError);
      return NextResponse.json(
        {
          bonus_granted: 0,
          reason_code: "transient_error" as ReferralCheckReasonCode,
          error: "紹介特典の確認に失敗しました",
        },
        { status: 500 }
      );
    }

    const result = Array.isArray(data) ? data[0] : null;
    const bonusGranted =
      typeof result?.bonus_granted === "number" ? result.bonus_granted : 0;
    const reasonCode = isReferralCheckReasonCode(result?.reason_code)
      ? result.reason_code
      : ("transient_error" as ReferralCheckReasonCode);

    if (bonusGranted > 0) {
      revalidateTag(`my-page-${user.id}`, "max");
      revalidateTag(`my-page-credits-${user.id}`, "max");
      revalidateTag(`coordinate-${user.id}`, "max");
      revalidateTag(`challenge-${user.id}`, "max");
    }

    return NextResponse.json({
      bonus_granted: bonusGranted,
      reason_code: reasonCode,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Referral Bonus] Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        reason_code: "transient_error" as ReferralCheckReasonCode,
        error:
          error instanceof Error
            ? error.message
            : "紹介特典の確認に失敗しました",
      },
      { status: 500 }
    );
  }
}

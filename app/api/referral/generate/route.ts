import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getReferralRouteCopy } from "@/features/referral/lib/route-copy";

/**
 * 紹介コード生成API
 * 認証済みユーザーの紹介コードを生成または取得します
 */
export async function GET(request: NextRequest) {
  await connection();
  const copy = getReferralRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          referral_code: null,
          error: copy.authRequired,
          errorCode: "REFERRAL_AUTH_REQUIRED",
        },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "generate_referral_code",
      {
        p_user_id: user.id,
      }
    );

    if (rpcError) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("[Referral Code] RPC error:", rpcError);
      return NextResponse.json(
        {
          referral_code: null,
          error: copy.referralGenerateFailed,
          errorCode: "REFERRAL_GENERATE_FAILED",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      referral_code: typeof data === "string" ? data : null,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Referral Code] Exception:", error);
    return NextResponse.json(
      {
        referral_code: null,
        error: copy.referralGenerateFailed,
        errorCode: "REFERRAL_GENERATE_FAILED",
      },
      { status: 500 }
    );
  }
}

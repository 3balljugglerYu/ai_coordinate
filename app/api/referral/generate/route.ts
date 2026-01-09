import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 紹介コード生成API
 * 認証済みユーザーの紹介コードを生成または取得します
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

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
          error: "紹介コードの生成に失敗しました",
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
        error:
          error instanceof Error
            ? error.message
            : "紹介コードの生成に失敗しました",
      },
      { status: 500 }
    );
  }
}


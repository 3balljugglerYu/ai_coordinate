import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => null);
    const confirmText = body?.confirmText as string | undefined;
    const password = body?.password as string | undefined;

    if (confirmText !== "DELETE") {
      return NextResponse.json(
        { error: "確認テキストに DELETE を入力してください" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const provider = (user.app_metadata?.provider as string | undefined) ?? "";
    const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
    const isEmailAuthUser = provider === "email" || providers.includes("email");

    if (isEmailAuthUser) {
      if (!password || !user.email) {
        return NextResponse.json(
          { error: "本人確認のためパスワードが必要です" },
          { status: 400 }
        );
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (signInError) {
        return NextResponse.json(
          { error: "パスワードが正しくありません" },
          { status: 401 }
        );
      }
    }

    const { data, error } = await supabase.rpc("request_account_deletion", {
      p_user_id: user.id,
      p_confirm_text: confirmText,
      p_reauth_ok: true,
    });

    if (error) {
      console.error("request_account_deletion error:", error);
      return NextResponse.json(
        { error: "退会申請に失敗しました" },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return NextResponse.json({
      success: true,
      status: row?.status ?? "scheduled",
      scheduled_for: row?.scheduled_for ?? null,
    });
  } catch (error) {
    console.error("Account deactivate route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

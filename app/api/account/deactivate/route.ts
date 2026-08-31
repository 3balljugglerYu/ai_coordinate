import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";
import { revalidatePromptActions } from "@/features/posts/lib/prompt-action-cache";

const deactivateRequestSchema = z.object({
  confirmText: z.string(),
  password: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const copy = getAccountRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ACCOUNT_AUTH_REQUIRED", 401);
    }
    const rawBody = await request.json().catch(() => null);
    const parsed = deactivateRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonError(copy.invalidDeactivateRequest, "ACCOUNT_DEACTIVATE_INVALID_REQUEST", 400);
    }

    const { confirmText, password } = parsed.data;

    if (confirmText !== "DELETE") {
      return jsonError(copy.deactivateConfirmRequired, "ACCOUNT_DEACTIVATE_CONFIRM_REQUIRED", 400);
    }

    const supabase = await createClient();

    const provider = (user.app_metadata?.provider as string | undefined) ?? "";
    const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
    const isEmailAuthUser = provider === "email" || providers.includes("email");

    if (isEmailAuthUser) {
      if (!password || !user.email) {
        return jsonError(copy.deactivatePasswordRequired, "ACCOUNT_DEACTIVATE_PASSWORD_REQUIRED", 400);
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (signInError) {
        return jsonError(copy.deactivatePasswordInvalid, "ACCOUNT_DEACTIVATE_PASSWORD_INVALID", 401);
      }
    }

    /*
      退会 RPC は service_role からのみ実行できるようにした。
      authenticated に開けたままだと、上のパスワード再認証を通さずに
      /rest/v1/rpc/request_account_deletion を直接叩けてしまい、
      再認証という前提が DB 境界で成立しない（p_reauth_ok は自己申告のため）。
      再認証を終えたこのルートだけが admin クライアントで呼ぶ。
    */
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.rpc("request_account_deletion", {
      p_user_id: user.id,
      p_confirm_text: confirmText,
      p_reauth_ok: true,
    });

    if (error) {
      console.error("request_account_deletion error:", error);
      return jsonError(copy.deactivateFailed, "ACCOUNT_DEACTIVATE_FAILED", 500);
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    /*
      削除予定に入ると、その作者の原作は内在的に利用不可へ落ちる
      (`validate_derived_prompt_source` が `profiles.deletion_scheduled_at` を
      条件に入れている)。フィードの CTA サマリは閲覧者をまたいで共有している
      ので、明示的に失効させないと数分間「使える」と返し続け、押した人が
      生成 API で弾かれる。

      復帰(`cancel_account_deletion`)は利用不可→可の向きなので、CTA が少し
      遅れて戻るだけ。共有キャッシュを無駄に捨てないよう自然失効に任せる。
    */
    revalidatePromptActions();

    return NextResponse.json({
      success: true,
      status: row?.status ?? "scheduled",
      scheduled_for: row?.scheduled_for ?? null,
    });
  } catch (error) {
    console.error("Account deactivate route error:", error);
    return jsonError(copy.deactivateFailed, "ACCOUNT_DEACTIVATE_FAILED", 500);
  }
}

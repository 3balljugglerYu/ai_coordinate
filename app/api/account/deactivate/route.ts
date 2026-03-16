import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";

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

    const { data, error } = await supabase.rpc("request_account_deletion", {
      p_user_id: user.id,
      p_confirm_text: confirmText,
      p_reauth_ok: true,
    });

    if (error) {
      console.error("request_account_deletion error:", error);
      return jsonError(copy.deactivateFailed, "ACCOUNT_DEACTIVATE_FAILED", 500);
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

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

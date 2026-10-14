import { NextRequest, NextResponse } from "next/server";
import { buildAppOAuthAuthorizeUrl } from "@/lib/auth/app-oauth";
import { env } from "@/lib/env";

/**
 * GET /api/auth/app-oauth?provider=google&code_challenge=...&code_challenge_method=s256
 *
 * アプリの Google / X ログインの入口。Supabase の authorize へ 302 で転送するだけ
 * (iOS のログイン確認に Supabase のドメインを出さないため。lib/auth/app-oauth.ts)。
 */
export async function GET(request: NextRequest) {
  const result = buildAppOAuthAuthorizeUrl(
    env.NEXT_PUBLIC_SUPABASE_URL,
    request.nextUrl.searchParams,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "not_configured" ? 500 : 400 },
    );
  }
  return NextResponse.redirect(result.url, 302);
}

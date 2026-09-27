import { NextRequest, NextResponse } from "next/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase の認証 Cookie 名: `sb-<project-ref>-auth-token`、分割された `.0` `.1` …、
 * PKCE の `-code-verifier`。
 */
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[a-z0-9]+-auth-token(?:$|[.-])/;

/**
 * POST /api/auth/signout — サーバー経由のログアウト。
 *
 * ブラウザ側のログアウト(supabase.auth.signOut)が失敗・無応答だったときの受け皿
 * (features/auth/lib/auth-client.ts の signOut から呼ぶ)。2026-09-27 に、ブラウザ側が
 * タブ間ロック待ちで失敗して Supabase に何も届かず、ログアウトできない不具合があった。
 *
 * - Supabase でもログアウトする(ブラウザ側と同じく、全端末のセッションを無効にする)
 * - Supabase 側が失敗しても、このブラウザの認証 Cookie は必ず消す(このブラウザでの
 *   ログアウトは完了させる)。revoked は Supabase 側のログアウトがエラーなく終わったか。
 *   セッションが無ければ Supabase は何もせずに成功を返すので、そのときも true になる
 * - proxy はこの経路でトークンを更新しない(proxy.ts。更新した Cookie と消す Cookie が
 *   同じレスポンスに並ぶのを避ける)
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) {
    return originGuard;
  }

  let revoked = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    revoked = !error;
    if (error) {
      console.warn("[auth/signout] Supabase sign-out failed:", error.message);
    }
  } catch (error) {
    console.warn("[auth/signout] Supabase sign-out threw:", error);
  }

  const response = NextResponse.json({ ok: true, revoked });
  for (const { name } of request.cookies.getAll()) {
    if (SUPABASE_AUTH_COOKIE_PATTERN.test(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}

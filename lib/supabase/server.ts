import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { isJwtUnexpired, readBearerJwt } from "@/lib/auth/bearer";

function requireSupabaseEnv() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
    );
  }

  return { url, anonKey };
}

/**
 * サーバー用Supabaseクライアント
 *
 * - ブラウザ(従来): クッキーから認証情報を取得する。挙動は無変更
 * - ネイティブアプリ: `Authorization: Bearer <Supabase access token>` があれば
 *   Cookie を読まず、そのトークンを Authorization ヘッダーとして持つクライアントを返す
 *   (`createBearerClient`)。同じリクエストで両方が来た場合は Bearer を優先する
 *   (アプリは Cookie を持たないので実際には共存しない)
 *
 * 設計: docs/planning/flutter-app-parity-implementation-plan.md ADR-001 / Phase 1
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();

  const bearerJwt = readBearerJwt(await headers());
  if (bearerJwt) {
    return createBearerClient(url, anonKey, bearerJwt);
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

/**
 * Bearer トークンを Authorization ヘッダーとして持つサーバークライアント。
 *
 * セッションは保存しない(= サーバーでは絶対にリフレッシュしない)。
 * - `global.headers.Authorization` を付けると supabase-js は
 *   `hasCustomAuthorizationHeader` を立て、`auth.getUser()`(引数なし)がセッション無しでも
 *   そのヘッダーで Supabase Auth の `/user` に問い合わせる
 *   (`@supabase/auth-js` GoTrueClient._getUser / supabase-js SupabaseClient)。
 *   よって既存ルートの `getUser()` と `supabase.auth.getUser()` が変更なしで本人として動く
 * - PostgREST / Storage へのリクエストも既に Authorization があればそれを使う
 *   (supabase-js fetchWithAuth)ため、RLS はトークンの本人で評価される
 * - 無効・改ざんトークンは Supabase Auth / PostgREST 側が拒否し、未認証(401)になる
 * - 期限切れは事前に弾いてヘッダーを付けない(= 未認証)。残り時間に関わらず
 *   `/token` へのリフレッシュ要求は発生しない。アプリ側が SDK でリフレッシュして再送する
 * - Cookie アダプタは何も読まず何も書かない(アプリのレスポンスに Set-Cookie は不要)
 */
function createBearerClient(url: string, anonKey: string, accessToken: string) {
  const noCookies = {
    getAll() {
      return [];
    },
    setAll() {
      // Bearer 経路では Cookie を発行しない
    },
  };

  if (!isJwtUnexpired(accessToken)) {
    // 期限切れはセッション無し・ヘッダー無しの未認証クライアント
    return createServerClient(url, anonKey, { cookies: noCookies });
  }

  return createServerClient(url, anonKey, {
    cookies: noCookies,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

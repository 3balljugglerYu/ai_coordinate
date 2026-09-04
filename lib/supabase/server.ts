import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { isJwtUnexpired, readBearerJwt } from "@/lib/auth/bearer";

/**
 * Bearer 経路で `auth.setSession` に渡すダミーの refresh token。
 *
 * auth-js の `setSession` は refresh_token が空だと AuthSessionMissingError を投げる
 * (`@supabase/auth-js` GoTrueClient._setSession)。アプリはトークンの更新を自前で行い
 * (401 を受けたら Supabase SDK でリフレッシュして再送)、サーバー側では決して
 * リフレッシュしないため、この値が Supabase に送られることはない。
 * 期限切れトークンは `isJwtUnexpired` で事前に弾き、リフレッシュ通信自体を起こさない。
 */
const BEARER_REFRESH_TOKEN_PLACEHOLDER = "persta-bearer-no-refresh";

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
 *   Cookie を読まず、そのトークンをセッションとして持つクライアントを返す
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
 * Bearer トークンをセッションとして持つサーバークライアント。
 *
 * `setSession` は Supabase Auth の `/user` でトークンを検証してからセッションを
 * 組み立てる(`@supabase/auth-js` GoTrueClient._setSession)。そのため無効な
 * トークンはセッション無し(= 未認証)になり、既存ルートの `getUser()` /
 * `supabase.auth.getUser()` / PostgREST の RLS がすべて「その本人」として動く。
 * Cookie アダプタは何も読まず何も書かない(アプリのリクエストに Set-Cookie は不要)。
 */
async function createBearerClient(
  url: string,
  anonKey: string,
  accessToken: string
) {
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Bearer 経路では Cookie を発行しない
      },
    },
  });

  if (!isJwtUnexpired(accessToken)) {
    // 期限切れはセッション無し(未認証)。アプリ側がリフレッシュして再送する
    return client;
  }

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: BEARER_REFRESH_TOKEN_PLACEHOLDER,
  });
  if (error) {
    // 検証に失敗したトークンはセッション無し(未認証)として扱う
    console.warn("[supabase/server] Bearer token rejected:", error.message);
  }

  return client;
}

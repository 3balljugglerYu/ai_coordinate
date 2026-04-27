import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { enforceApiDocsBasicAuth } from "@/lib/api-docs-auth";
import { enforceI2iPocBasicAuth } from "@/lib/i2i-poc-auth";
import {
  ensureGuestIdOnResponse,
  shouldIssueGuestIdForPathname,
} from "@/lib/guest-id";
import {
  getLocaleCookieMaxAge,
  isPublicPath,
  localizePublicPath,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  resolveRequestLocale,
  stripLocalePrefix,
  type Locale,
} from "@/i18n/config";

/**
 * プロキシ（ミドルウェア）
 * 認証状態の確認とセッション管理を行う
 * Next.js 16では middleware.ts の代わりに proxy.ts を使用
 */
export async function proxy(request: NextRequest) {
  const apiDocsAuthResponse = enforceApiDocsBasicAuth(request);
  if (apiDocsAuthResponse) {
    return apiDocsAuthResponse;
  }

  const basicAuthResponse = enforceI2iPocBasicAuth(request);
  if (basicAuthResponse) {
    return basicAuthResponse;
  }

  const pathname = request.nextUrl.pathname;
  const resolvedLocale = resolveRequestLocale({
    pathname,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const { pathname: unprefixedPathname, locale: pathnameLocale } =
    stripLocalePrefix(pathname);
  const isPublicRoute = isPublicPath(unprefixedPathname);
  if (isPublicRoute && !pathnameLocale) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizePublicPath(unprefixedPathname, resolvedLocale);

    const redirectResponse = NextResponse.redirect(redirectUrl);
    applyLocaleCookie(redirectResponse, resolvedLocale);
    return redirectResponse;
  }

  let response = createNextResponse(request, resolvedLocale);

  // 環境変数が設定されていない場合は、認証チェックをスキップ
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // 環境変数が設定されていない場合は、そのまま通過させる
    // 開発環境で環境変数が未設定の場合にエラーを回避
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = createNextResponse(request, resolvedLocale);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Proxy では cookie/session から軽量にユーザーを解決する。
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    console.warn("[proxy] Failed to read auth session:", sessionError.message);
  }
  const userId = session?.user?.id ?? null;

  if (userId) {
    // 認証済みユーザーがログイン・サインアップ・パスワードリセットにアクセスしたら /my-page へリダイレクト
    const authPages = ["/login", "/signup", "/reset-password"];
    const isAuthPage = authPages.some((path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`)
    );

    if (isAuthPage) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/my-page";
      redirectUrl.search = "";
      const redirectResponse = NextResponse.redirect(redirectUrl);
      applyLocaleCookie(redirectResponse, resolvedLocale);
      return redirectResponse;
    }

    const allowedWhileDeactivated = [
      "/account/reactivate",
      "/api/account/reactivate",
      "/login",
      "/auth/callback",
      "/auth/x-complete",
    ];

    const isAllowedWhileDeactivated = allowedWhileDeactivated.some((path) =>
      request.nextUrl.pathname.startsWith(path)
    );

    // 公開ページでは公開コンテンツの閲覧だけを許可し、
    // 追加の profile 参照コストは避ける。
    if (!isAllowedWhileDeactivated && !isPublicRoute) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("deactivated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile?.deactivated_at) {
        if (request.nextUrl.pathname.startsWith("/api")) {
          return NextResponse.json(
            { error: "Account is deactivated" },
            { status: 403 }
          );
        }

        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/account/reactivate";
        redirectUrl.search = "";
        const redirectResponse = NextResponse.redirect(redirectUrl);
        applyLocaleCookie(redirectResponse, resolvedLocale);
        return redirectResponse;
      }
    }
  }

  // 認証が必要なページ（(app)ルートグループ）の保護
  // /dashboard など認証が必要なパスを保護
  const protectedPaths = ["/dashboard", "/challenge"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath) {
    if (!userId) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      applyLocaleCookie(redirectResponse, resolvedLocale);
      return redirectResponse;
    }
  }

  // /style と /coordinate 配下では未ログインユーザーのレート制限識別に使う
  // 永続 Cookie を発行する（既に存在すれば触らない）。Cookie が無いとサーバー側で
  // ゲストレート制限を成立させられないため、ページ表示の段階で発行しておく。
  if (shouldIssueGuestIdForPathname(pathname)) {
    ensureGuestIdOnResponse(request, response);
  }

  return response;
}

function createNextResponse(request: NextRequest, locale: Locale) {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);

  const response = NextResponse.next({
    request: {
      headers,
    },
  });

  applyLocaleCookie(response, locale);
  return response;
}

function applyLocaleCookie(response: NextResponse, locale: Locale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: getLocaleCookieMaxAge(),
    sameSite: "lax",
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

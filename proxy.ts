import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * プロキシ（ミドルウェア）
 * 認証状態の確認とセッション管理を行う
 * Next.js 16では middleware.ts の代わりに proxy.ts を使用
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // セッションを更新
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
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

    if (!isAllowedWhileDeactivated) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("deactivated_at")
        .eq("user_id", user.id)
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
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  // 認証が必要なページ（(app)ルートグループ）の保護
  // /dashboard、/api/generate など認証が必要なパスを保護
  const protectedPaths = ["/dashboard", "/challenge"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
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

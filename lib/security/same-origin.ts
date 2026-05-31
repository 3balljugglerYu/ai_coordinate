import { NextRequest, NextResponse } from "next/server";

/**
 * Same-Origin チェック helper。cookie 認証つき mutation route (admin / authenticated async)
 * から呼び出して、cross-site POST / PATCH / DELETE を 403 で拒否する。
 *
 * - 同一オリジン (= Origin ヘッダーが自サイトの Host と一致) のみ許可
 * - Origin ヘッダー無し (旧ブラウザ / fetch 以外) は許可しない (= 厳格)
 * - GET / HEAD はそもそも安全 method として呼ばない想定 (= mutation 専用 helper)
 *
 * 戻り値:
 *   - `null` = OK (= 同一オリジン)
 *   - `NextResponse` = NG (= 呼び出し側はそのまま return する)
 *
 * 設計: docs/planning/style-preset-user-dual-and-prompt-implementation-plan.md REQ-14 参照
 */
export function ensureSameOrigin(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();
  // 安全 method は素通し (mutation 専用 helper だが念のためガード)
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return NextResponse.json(
      { error: "Missing Origin header" },
      { status: 403 },
    );
  }

  // 自サイトの host。Next.js は `request.nextUrl.host` を信頼された
  // プロキシ設定 (Vercel など) で正規化して返すため、生の x-forwarded-host /
  // host を手動 parse するよりヘッダースプーフィングに堅牢。
  const host = request.nextUrl.host;
  if (!host) {
    // host が取れないのは異常な構成なので拒否
    return NextResponse.json(
      { error: "Missing Host header" },
      { status: 403 },
    );
  }

  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return NextResponse.json(
      { error: "Invalid Origin header" },
      { status: 403 },
    );
  }

  // origin の host (port 含む) と request host を比較
  if (originUrl.host !== host) {
    return NextResponse.json(
      { error: "Cross-site request rejected" },
      { status: 403 },
    );
  }

  return null;
}

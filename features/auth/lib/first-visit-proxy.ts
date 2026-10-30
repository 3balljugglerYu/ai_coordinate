import type { NextRequest, NextResponse } from "next/server";
import {
  FIRST_VISIT_COOKIE,
  FIRST_VISIT_COOKIE_MAX_AGE_SECONDS,
  FIRST_VISIT_PARAM,
  detectFirstVisitChannel,
  normalizeLandingPath,
  parseFirstVisit,
  serializeFirstVisit,
  type FirstVisit,
} from "./first-visit";

/**
 * ページを開いた最初の通信で、最初に来た場所を cookie に残す(proxy.ts から呼ぶ)。
 *
 * サーバーの応答(Set-Cookie)で付けるので、Safari(ITP)の「スクリプトで書いた cookie は
 * 7日・広告の印つきは24時間」の上限を受けない。登録のとき、メールでは画面がこの cookie を読んで
 * user_metadata に入れるので、HttpOnly にはしない(中身は来た場所とパスだけ)。
 *
 * - ページを開く通信(ブラウザの画面の読み込み)だけで付ける。API・画面の裏の通信・先読みでは付けない
 * - すでにあれば何もしない(最初の訪問を残す)
 * - URL に `first_visit` があれば、その値を使う(アプリの中のブラウザから外へ移ったときの引き継ぎ)
 */

function isPageNavigation(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.nextUrl.pathname.startsWith("/api")) return false;
  const headers = request.headers;
  // 画面の裏の通信(RSC)と先読み
  if (headers.get("rsc") || headers.get("next-router-prefetch") || headers.get("purpose") === "prefetch") {
    return false;
  }
  const dest = headers.get("sec-fetch-dest");
  if (dest) return dest === "document";
  return (headers.get("accept") ?? "").includes("text/html");
}

/** この通信で残す値。付けないときは null */
export function decideFirstVisit(request: NextRequest): FirstVisit | null {
  if (request.cookies.get(FIRST_VISIT_COOKIE)?.value) return null;
  if (!isPageNavigation(request)) return null;

  const handedOver = parseFirstVisit(request.nextUrl.searchParams.get(FIRST_VISIT_PARAM));
  if (handedOver) return handedOver;

  return {
    channel: detectFirstVisitChannel({
      search: request.nextUrl.search,
      userAgent: request.headers.get("user-agent") ?? "",
      referrer: request.headers.get("referer") ?? "",
      siteHost: request.nextUrl.hostname,
    }),
    landingPath: normalizeLandingPath(request.nextUrl.pathname),
  };
}

export function attachFirstVisitCookie(request: NextRequest, response: NextResponse): void {
  const visit = decideFirstVisit(request);
  if (!visit) return;
  response.cookies.set({
    name: FIRST_VISIT_COOKIE,
    value: serializeFirstVisit(visit),
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: FIRST_VISIT_COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

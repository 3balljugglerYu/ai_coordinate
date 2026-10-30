import { NextResponse, type NextRequest } from "next/server";
import { stripLocalePrefix } from "@/i18n/config";
import { isPrefetchRequest } from "@/lib/utils";
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
 * - ログインの途中(/auth/ の下)では付けない。OAuth の参照元(x.com・accounts.google.com)と
 *   /auth/... のパスを、最初に来た場所として残さないため
 * - すでに読める値があれば何もしない(最初の訪問を残す)。読めない値は無いものとして付け直す
 * - 最初の画面のパスは、言語の部分(/ja など)を外してそろえる(/style と /ja/style を分けない)
 * - URL の `first_visit`(アプリの中のブラウザから外へ移ったときの引き継ぎ)は handleFirstVisitHandoff で扱う
 */

const COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: FIRST_VISIT_COOKIE_MAX_AGE_SECONDS,
};

function isPageNavigation(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  const headers = request.headers;
  // 画面の裏の通信(RSC)と先読み(Chrome のアドレスバーの先読みは Sec-Purpose: prefetch;prerender)
  if (headers.get("rsc") || isPrefetchRequest(headers)) return false;
  if ((headers.get("sec-purpose") ?? "").toLowerCase().startsWith("prefetch")) return false;
  const dest = headers.get("sec-fetch-dest");
  if (dest) return dest === "document";
  return (headers.get("accept") ?? "").includes("text/html");
}

function isExcludedPath(pathname: string): boolean {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return unprefixed.startsWith("/api") || unprefixed === "/auth" || unprefixed.startsWith("/auth/");
}

function hasValidCookie(request: NextRequest): boolean {
  return parseFirstVisit(request.cookies.get(FIRST_VISIT_COOKIE)?.value) !== null;
}

function landingPathOf(request: NextRequest): string | null {
  return normalizeLandingPath(stripLocalePrefix(request.nextUrl.pathname).pathname);
}

function setFirstVisitCookie(response: NextResponse, visit: FirstVisit): void {
  response.cookies.set({
    name: FIRST_VISIT_COOKIE,
    value: serializeFirstVisit(visit),
    ...COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** この通信で残す値。付けないときは null */
export function decideFirstVisit(request: NextRequest): FirstVisit | null {
  if (hasValidCookie(request)) return null;
  if (!isPageNavigation(request) || isExcludedPath(request.nextUrl.pathname)) return null;

  return {
    channel: detectFirstVisitChannel({
      search: request.nextUrl.search,
      userAgent: request.headers.get("user-agent") ?? "",
      referrer: request.headers.get("referer") ?? "",
      siteHost: request.nextUrl.hostname,
    }),
    landingPath: landingPathOf(request),
  };
}

export function attachFirstVisitCookie(request: NextRequest, response: NextResponse): void {
  const visit = decideFirstVisit(request);
  if (visit) setFirstVisitCookie(response, visit);
}

/**
 * URL に `first_visit` があれば、それを消したアドレスへ移し直す(proxy.ts の最初に呼ぶ)。
 * まだ読める cookie が無ければ、引き継いだ値で付ける。
 * URL に残すと、アドレスバーからコピー・共有された URL を通じて、ほかの人にも同じ値が付くため。
 */
export function handleFirstVisitHandoff(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.searchParams.has(FIRST_VISIT_PARAM)) return null;
  if (request.method !== "GET" || isExcludedPath(request.nextUrl.pathname)) return null;

  const handedOver = parseFirstVisit(request.nextUrl.searchParams.get(FIRST_VISIT_PARAM));
  const cleanUrl = request.nextUrl.clone();
  cleanUrl.searchParams.delete(FIRST_VISIT_PARAM);
  const response = NextResponse.redirect(cleanUrl, 307);
  if (handedOver && !hasValidCookie(request)) {
    setFirstVisitCookie(response, handedOver);
  }
  return response;
}

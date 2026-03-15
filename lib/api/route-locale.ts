import type { NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  resolveRequestLocale,
  type Locale,
} from "@/i18n/config";

export function getRouteLocale(request: NextRequest): Locale {
  return resolveRequestLocale({
    pathname: request.nextUrl.pathname,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
}

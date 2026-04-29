export const locales = ["ja", "en"] as const;

export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = "ja";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const PUBLIC_PATH_PATTERNS = [
  /^\/$/,
  /^\/about$/,
  /^\/credits\/purchase$/,
  /^\/pricing$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/tokushoho$/,
  /^\/payment-services-act$/,
  /^\/thanks-sample$/,
  /^\/free-materials$/,
  /^\/search$/,
  /^\/posts\/[^/]+$/,
  /^\/i2i\/[^/]+$/,
];

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale);
}

export function getLocaleLabel(locale: Locale): string {
  return locale === "ja" ? "日本語" : "English";
}

export function getLocaleCookieMaxAge() {
  return LOCALE_COOKIE_MAX_AGE;
}

export function stripLocalePrefix(pathname: string): {
  locale?: Locale;
  pathname: string;
} {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];

  if (!isLocale(maybeLocale)) {
    return { pathname };
  }

  const nextPath = `/${segments.slice(2).join("/")}`.replace(/\/+/g, "/");

  return {
    locale: maybeLocale,
    pathname: nextPath === "/" ? "/" : nextPath.replace(/\/$/, "") || "/",
  };
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function localizePublicPath(pathname: string, locale: Locale) {
  const { pathname: unprefixedPathname } = stripLocalePrefix(pathname);

  if (!isPublicPath(unprefixedPathname)) {
    return unprefixedPathname;
  }

  if (unprefixedPathname === "/") {
    return `/${locale}`;
  }

  return `/${locale}${unprefixedPathname}`;
}

export function appendSearchAndHash(
  pathname: string,
  search?: string,
  hash?: string
) {
  const searchPart = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const hashPart = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${pathname}${searchPart}${hashPart}`;
}

export function resolveLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined
): Locale {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const candidates = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tagPart, ...params] = entry.trim().split(";");
      const qualityParam = params.find((param) => param.trim().startsWith("q="));
      const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;

      return {
        tag: tagPart.toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((left, right) => right.quality - left.quality);

  return candidates.some((candidate) => candidate.tag === "ja" || candidate.tag.startsWith("ja-"))
    ? "ja"
    : "en";
}

export function resolveRequestLocale({
  pathname,
  cookieLocale,
  acceptLanguage,
}: {
  pathname: string;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}) {
  const { locale: pathnameLocale } = stripLocalePrefix(pathname);

  if (pathnameLocale) {
    return pathnameLocale;
  }

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  return resolveLocaleFromAcceptLanguage(acceptLanguage);
}

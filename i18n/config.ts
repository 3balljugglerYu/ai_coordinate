export const locales = [
  "ja",
  "en",
  "ko",
  "zh-CN",
  "zh-TW",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "id",
  "th",
  "vi",
  "hi",
  "ar",
] as const;

const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar"]);

export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function getLocaleDir(locale: Locale): "rtl" | "ltr" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

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
  /^\/community-guidelines$/,
  /^\/tokushoho$/,
  /^\/payment-services-act$/,
  /^\/thanks-sample$/,
  /^\/free-materials$/,
  /^\/search$/,
  /^\/posts\/[^/]+$/,
  /^\/i2i\/[^/]+$/,
  /^\/catalog$/,
  /^\/catalog\/[^/]+$/,
  /^\/catalog\/[^/]+\/p\/[^/]+$/,
  /^\/catalog\/submit$/,
  /^\/catalog\/submit\/thanks$/,
];

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale);
}

const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  ko: "한국어",
  "zh-CN": "中文 (简体)",
  "zh-TW": "中文 (繁體)",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  id: "Bahasa Indonesia",
  th: "ภาษาไทย",
  vi: "Tiếng Việt",
  hi: "हिन्दी",
  ar: "العربية",
};

export function getLocaleLabel(locale: Locale): string {
  return LOCALE_LABELS[locale];
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

// Accept-Language の生 BCP47 タグ（小文字化済み）から、サポート Locale にマッチさせる。
// 完全一致 → スクリプト変種別名（zh-Hans/zh-Hant）→ プライマリ言語タグ（en-US → en）の順。
const ACCEPT_LANGUAGE_EXACT_MAP: Record<string, Locale> = {
  ja: "ja",
  en: "en",
  ko: "ko",
  "zh-cn": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hans": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-sg": "zh-CN",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  zh: "zh-CN",
  es: "es",
  pt: "pt",
  "pt-br": "pt",
  "pt-pt": "pt",
  fr: "fr",
  de: "de",
  it: "it",
  id: "id",
  th: "th",
  vi: "vi",
  hi: "hi",
  ar: "ar",
};

function matchAcceptLanguageTag(tag: string): Locale | null {
  let current = tag.toLowerCase();

  while (current) {
    if (
      Object.prototype.hasOwnProperty.call(ACCEPT_LANGUAGE_EXACT_MAP, current)
    ) {
      return ACCEPT_LANGUAGE_EXACT_MAP[current];
    }

    const lastDashIndex = current.lastIndexOf("-");
    if (lastDashIndex === -1) {
      break;
    }
    current = current.slice(0, lastDashIndex);
  }

  return null;
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
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const matched = matchAcceptLanguageTag(candidate.tag);
    if (matched) return matched;
  }

  return DEFAULT_LOCALE;
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

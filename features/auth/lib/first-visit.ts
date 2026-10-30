import {
  detectSignupChannel,
  referrerHost,
  withSignupSourceParam,
  type SignupSource,
} from "./signup-source";

/**
 * 最初に来た場所と、最初に開いた画面(管理ダッシュボード P3-3)。
 * 計画: docs/planning/admin-growth-p3-instrumentation-plan.md 5章
 *
 * はじめてペルスタを開いた最初の通信で、サーバー(proxy.ts → first-visit-proxy.ts)が
 * cookie `persta_first_visit`(30日・最初に来た時だけ)を付ける。ブラウザ(document.cookie)で
 * 書くと、Safari(ITP)では7日、広告の印が付いた URL から来たときは24時間で消えるため。
 * 登録のときに user_first_visits へ書く(メールは user_metadata → トリガー、OAuth は /auth/callback)。
 *
 * アプリの中のブラウザ(X・Instagram)から外のブラウザへ移るときは cookie が移らないので、
 * URL の `first_visit` に載せて引き継ぐ(流入元の withSignupSourceParam と同じ考え方)。
 *
 * ⚠️ 流入元の cookie(persta_signup_source)とは別に持つ。あちらは「すでにあれば書かない」ので、
 * 目印の無い訪問の値を先に書くと、あとで開いた企画ページの既定値が書けなくなる。
 * ⚠️ detectSignupChannel そのものは広げない。企画ページの appendSignupChannel が使っていて、
 * 広げると `halloween-best-shot_direct` のような新しい値ができ、今の流入元の数え方が分かれる。
 */

export const FIRST_VISIT_COOKIE = "persta_first_visit";
export const FIRST_VISIT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** アプリの中のブラウザから外のブラウザへ引き継ぐ URL のパラメータ */
export const FIRST_VISIT_PARAM = "first_visit";

/** DB の user_first_visits_channel_check と一致させること */
export const FIRST_VISIT_CHANNELS = ["x_ad", "x", "meta", "search", "direct", "other"] as const;
export type FirstVisitChannel = (typeof FIRST_VISIT_CHANNELS)[number];

/** DB の user_first_visits_landing_path_check と一致させること */
export const FIRST_LANDING_PATH_MAX_LENGTH = 200;
const LANDING_PATH_PATTERN = /^\/[^?#]*$/;

export interface FirstVisit {
  channel: FirstVisitChannel;
  /** 最初に開いた画面のパス(クエリ・# のうしろは含まない)。書式に合わなければ null */
  landingPath: string | null;
}

/**
 * 検索の画面(参照元のホスト)。同じ会社でも検索でない所(Gmail・Google ドキュメント・
 * Yahoo! ニュース・NAVER ブログなど)は入れない。
 */
const SEARCH_HOSTS: readonly RegExp[] = [
  /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/,
  // Android の Google アプリ(検索と Discover)
  /^com\.google\.android\.googlequicksearchbox$/,
  /^(www\.)?bing\.com$/,
  /^([a-z]{2}\.)?search\.yahoo\.(co\.jp|com)$/,
  /^(www\.|html\.)?duckduckgo\.com$/,
  /^(www\.)?ecosia\.org$/,
  /^search\.brave\.com$/,
  /^(m\.)?search\.naver\.com$/,
  /^(www\.|m\.)?baidu\.com$/,
];

function withoutWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * 来た場所。X・X の広告・メタは今の detectSignupChannel で見分け、それ以外を
 * 検索(search)・ほかのサイト(other)・直接(direct・参照元なしか、ペルスタの中)に分ける。
 */
export function detectFirstVisitChannel({
  search,
  userAgent,
  referrer,
  siteHost,
}: {
  search: string;
  userAgent: string;
  referrer: string;
  /** 今のページのホスト(参照元がペルスタの中なら direct にする) */
  siteHost: string;
}): FirstVisitChannel {
  const known = detectSignupChannel({ search, userAgent, referrer });
  if (known) return known;
  const host = referrerHost(referrer);
  if (!host || withoutWww(host) === withoutWww(siteHost.toLowerCase())) return "direct";
  if (SEARCH_HOSTS.some((pattern) => pattern.test(host))) return "search";
  return "other";
}

function isDecodable(value: string): boolean {
  try {
    decodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * パスを DB の決まりにそろえる。合わなければ null。
 * 長すぎるものは切る。日本語などは `%E3%83%8F` の形(1文字が %XX の2〜4つ)なので、
 * 切った所で途中になった %X と、途中で切れた1文字の分(%80 以上の %XX)だけを削る。
 * それでも読めなければ(切った所より前が壊れている)、違うパスを返さないよう null にする。
 */
export function normalizeLandingPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  let path = pathname;
  if (path.length > FIRST_LANDING_PATH_MAX_LENGTH) {
    path = path.slice(0, FIRST_LANDING_PATH_MAX_LENGTH).replace(/%[0-9A-Fa-f]?$/, "");
    for (let i = 0; i < 3 && !isDecodable(path) && /%[89A-Fa-f][0-9A-Fa-f]$/.test(path); i += 1) {
      path = path.slice(0, -3);
    }
  }
  return LANDING_PATH_PATTERN.test(path) && isDecodable(path) ? path : null;
}

function isFirstVisitChannel(value: string): value is FirstVisitChannel {
  return (FIRST_VISIT_CHANNELS as readonly string[]).includes(value);
}

/** cookie と URL に載せる値(エンコード前)。`<来た場所>|<パス>` */
export function serializeFirstVisit(visit: FirstVisit): string {
  return `${visit.channel}|${visit.landingPath ?? ""}`;
}

/** cookie・URL の値(デコード後)を読む。来た場所が決まりに合わなければ null */
export function parseFirstVisit(value: string | null | undefined): FirstVisit | null {
  if (!value) return null;
  const separator = value.indexOf("|");
  const channel = separator === -1 ? value : value.slice(0, separator);
  if (!isFirstVisitChannel(channel)) return null;
  return {
    channel,
    landingPath: separator === -1 ? null : normalizeLandingPath(value.slice(separator + 1)),
  };
}

/** `a=1; b=2` の形の cookie の文字列から、最初に来た場所を読む */
export function readFirstVisitFromCookieHeader(cookieHeader: string | null | undefined): FirstVisit | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== FIRST_VISIT_COOKIE) continue;
    try {
      return parseFirstVisit(decodeURIComponent(rest.join("=")));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 外のブラウザで開き直す URL に、最初に来た場所を載せる(アプリの中のブラウザの cookie は移らないため)。
 * 値が無ければ、URL はそのまま。
 */
export function withFirstVisitParam(href: string, visit: FirstVisit | null): string {
  if (!visit) return href;
  try {
    const url = new URL(href);
    url.searchParams.set(FIRST_VISIT_PARAM, serializeFirstVisit(visit));
    return url.toString();
  } catch {
    return href;
  }
}

/** ブラウザの cookie にある値で withFirstVisitParam する(画面から使う) */
export function withFirstVisitParamFromDocument(href: string): string {
  if (typeof document === "undefined") return href;
  return withFirstVisitParam(href, readFirstVisitFromCookieHeader(document.cookie));
}

/**
 * アプリの中のブラウザから外のブラウザで開き直す URL。cookie は移らないので、
 * 流入元(signup_source)と最初に来た場所(first_visit)を URL に載せる。
 */
export function buildExternalBrowserHref(href: string, signupSource: SignupSource | null): string {
  return withFirstVisitParamFromDocument(withSignupSourceParam(href, signupSource));
}

/** 記録したあとに消す(同じブラウザで別の人が登録したとき、前の人の値を使わないように) */
export function clearFirstVisitCookieInDocument(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${FIRST_VISIT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

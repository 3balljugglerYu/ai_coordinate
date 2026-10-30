import { detectSignupChannel } from "./signup-source";

/**
 * 最初に来た場所と、最初に開いた画面(管理ダッシュボード P3-3)。
 * 計画: docs/planning/admin-growth-p3-instrumentation-plan.md 5章
 *
 * はじめてペルスタに来たとき、cookie `persta_first_visit`(30日・最初に来た時だけ)に残し、
 * 登録のときに user_first_visits へ書く(メールは user_metadata → トリガー、OAuth は /auth/callback)。
 *
 * ⚠️ 流入元の cookie(persta_signup_source)とは別に持つ。あちらは「すでにあれば書かない」ので、
 * 目印の無い訪問の値を先に書くと、あとで開いた企画ページの既定値が書けなくなる。
 * ⚠️ detectSignupChannel そのものは広げない。企画ページの appendSignupChannel が使っていて、
 * 広げると `halloween-best-shot_direct` のような新しい値ができ、今の流入元の数え方が分かれる。
 */

export const FIRST_VISIT_COOKIE = "persta_first_visit";
export const FIRST_VISIT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

/** 検索サイト(参照元のホスト) */
const SEARCH_HOSTS: readonly RegExp[] = [
  /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/,
  /^com\.google\.android\.googlequicksearchbox$/,
  /(^|\.)bing\.com$/,
  /^search\.yahoo\.(co\.jp|com)$/,
  /(^|\.)duckduckgo\.com$/,
  /(^|\.)ecosia\.org$/,
  /^search\.brave\.com$/,
  /(^|\.)naver\.com$/,
  /(^|\.)baidu\.com$/,
];

function hostOf(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

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
  const host = hostOf(referrer);
  if (!host || withoutWww(host) === withoutWww(siteHost.toLowerCase())) return "direct";
  if (SEARCH_HOSTS.some((pattern) => pattern.test(host))) return "search";
  return "other";
}

/** パスを DB の決まりにそろえる。合わなければ null(長すぎるものは切る) */
export function normalizeLandingPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.slice(0, FIRST_LANDING_PATH_MAX_LENGTH);
  return LANDING_PATH_PATTERN.test(path) ? path : null;
}

function isFirstVisitChannel(value: string): value is FirstVisitChannel {
  return (FIRST_VISIT_CHANNELS as readonly string[]).includes(value);
}

/** cookie の値(エンコード前)。`<来た場所>|<パス>` */
export function serializeFirstVisit(visit: FirstVisit): string {
  return `${visit.channel}|${visit.landingPath ?? ""}`;
}

/** cookie の値(デコード後)を読む。来た場所が決まりに合わなければ null */
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

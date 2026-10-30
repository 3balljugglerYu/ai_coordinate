/**
 * 広告の数字（ad_platform_daily_stats・ad_platform_ads）の形と表示名。
 * 画面（クライアント）からも読むので、サーバー専用のものは置かない。
 */

export const AD_PLATFORMS = ["meta", "x"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta",
  x: "X",
};

/** グラフの媒体の色（媒体ごとに固定。白地で色覚の違いがあっても見分けられることを確かめた組み合わせ） */
export const AD_PLATFORM_COLORS: Record<AdPlatform, string> = {
  meta: "#7C3AED",
  x: "#EA580C",
};

export const AD_BREAKDOWN_TYPES = [
  "none",
  "age",
  "gender",
  "placement",
  "device",
  "location",
] as const;
export type AdBreakdownType = (typeof AD_BREAKDOWN_TYPES)[number];

export const AD_BREAKDOWN_LABELS: Record<AdBreakdownType, string> = {
  none: "内訳なし",
  age: "年齢",
  gender: "性別",
  placement: "出した場所",
  device: "端末",
  location: "地域",
};

/** 1日・1広告・1内訳の数字。書き出しに列が無いものは null（0 と区別する）。 */
export interface AdStatRow {
  platform: AdPlatform;
  /** YYYY-MM-DD */
  statDate: string;
  adKey: string;
  adName: string;
  breakdownType: AdBreakdownType;
  /** 内訳なしのときは空文字 */
  breakdownValue: string;
  spendJpy: number;
  impressions: number;
  reach: number | null;
  linkClicks: number | null;
  landingPageViews: number | null;
  videoViews: number | null;
}

/** ad_platform_ads の1行（目印を選べる広告）。 */
export interface AdIdentity {
  platform: AdPlatform;
  adKey: string;
  adName: string;
}

export interface ParsedAdExport {
  platform: AdPlatform;
  rows: AdStatRow[];
  /** 目印を選べる広告（X の「書き出し全体」の内訳は入らない） */
  ads: AdIdentity[];
}

/** X の年齢・性別・端末の内訳は書き出し全体の数字なので、ad_key をこの頭で始める */
export const AD_EXPORT_GROUP_KEY_PREFIX = "all:";
/** Meta の CSV には広告 ID が無いので、広告名で見分ける */
export const AD_NAME_KEY_PREFIX = "name:";

export function isExportGroupKey(adKey: string): boolean {
  return adKey.startsWith(AD_EXPORT_GROUP_KEY_PREFIX);
}

/** profiles.signup_source と同じ書式（DB の CHECK と一致させる） */
export const AD_SIGNUP_SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/;

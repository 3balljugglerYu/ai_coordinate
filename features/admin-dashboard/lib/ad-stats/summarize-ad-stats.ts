import {
  isExportGroupKey,
  type AdBreakdownType,
  type AdPlatform,
  type AdStatRow,
} from "./ad-stats-types";

/**
 * 取り込んだ広告の行を、画面で見る形にまとめる（DB を読まない計算だけ）。
 *
 * 広告ごとの合計は、日ごとに「内訳なしの行」を使い、無い日は内訳の行を1種類だけ足す。
 * Meta の書き出しは年齢別か配置別しかないことが多いので、内訳の行から合計を作る。
 * 年齢別と配置別の両方を取り込んでも、1種類だけ使うので二重に数えない。
 */

/** 内訳の行から合計を作るときに使う順（年齢は全員が必ずどこか1つに入るので最初） */
const TOTAL_SOURCE_ORDER: AdBreakdownType[] = [
  "none",
  "age",
  "gender",
  "placement",
  "device",
  "location",
];

export interface AdFunnel {
  signups: number;
  generated: number;
  posted: number;
}

export interface AdMetrics {
  spendJpy: number;
  impressions: number;
  linkClicks: number | null;
  landingPageViews: number | null;
  videoViews: number | null;
}

export interface AdSummary extends AdMetrics {
  platform: AdPlatform;
  adKey: string;
  adName: string;
  firstDate: string;
  lastDate: string;
  signupSource: string | null;
  /** 目印が無いときは null（0人とは区別する） */
  funnel: AdFunnel | null;
}

export interface BreakdownItem extends AdMetrics {
  value: string;
  /** その内訳の中で、使った額に占める割合（0〜1） */
  spendShare: number;
}

export interface BreakdownGroup {
  platform: AdPlatform;
  adKey: string;
  adName: string;
  firstDate: string;
  lastDate: string;
  breakdowns: Array<{ type: AdBreakdownType; items: BreakdownItem[] }>;
}

export interface AdStatsSummary {
  ads: AdSummary[];
  totals: Array<{ platform: AdPlatform } & AdMetrics>;
  groups: BreakdownGroup[];
}

export interface AdMeta {
  platform: AdPlatform;
  adKey: string;
  signupSource: string | null;
}

type StatRow = Pick<
  AdStatRow,
  | "platform"
  | "statDate"
  | "adKey"
  | "adName"
  | "breakdownType"
  | "breakdownValue"
  | "spendJpy"
  | "impressions"
  | "linkClicks"
  | "landingPageViews"
  | "videoViews"
>;

function emptyMetrics(): AdMetrics {
  return { spendJpy: 0, impressions: 0, linkClicks: null, landingPageViews: null, videoViews: null };
}

function addNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function addMetrics(target: AdMetrics, row: AdMetrics): void {
  target.spendJpy += row.spendJpy;
  target.impressions += row.impressions;
  target.linkClicks = addNullable(target.linkClicks, row.linkClicks);
  target.landingPageViews = addNullable(target.landingPageViews, row.landingPageViews);
  target.videoViews = addNullable(target.videoViews, row.videoViews);
}

function roundYen(metrics: AdMetrics): AdMetrics {
  return { ...metrics, spendJpy: Math.round(metrics.spendJpy) };
}

function adId(platform: AdPlatform, adKey: string): string {
  return `${platform}\u0000${adKey}`;
}

function byLatestThenName<T extends { lastDate: string; adName: string }>(a: T, b: T): number {
  return b.lastDate.localeCompare(a.lastDate) || a.adName.localeCompare(b.adName, "ja");
}

export function summarizeAdStats(
  rows: StatRow[],
  ads: AdMeta[],
  funnelBySource: Map<string, AdFunnel>,
): AdStatsSummary {
  const meta = new Map(ads.map((ad) => [adId(ad.platform, ad.adKey), ad]));

  // 広告ごと・日ごとに、内訳の種類ごとの行を分ける
  const perAd = new Map<
    string,
    { platform: AdPlatform; adKey: string; adName: string; days: Map<string, Map<AdBreakdownType, StatRow[]>> }
  >();
  for (const row of rows) {
    const key = adId(row.platform, row.adKey);
    let ad = perAd.get(key);
    if (!ad) {
      ad = { platform: row.platform, adKey: row.adKey, adName: row.adName, days: new Map() };
      perAd.set(key, ad);
    }
    let day = ad.days.get(row.statDate);
    if (!day) {
      day = new Map();
      ad.days.set(row.statDate, day);
    }
    const list = day.get(row.breakdownType) ?? [];
    list.push(row);
    day.set(row.breakdownType, list);
  }

  const summaries: AdSummary[] = [];
  const groups: BreakdownGroup[] = [];
  for (const ad of perAd.values()) {
    const dates = [...ad.days.keys()].sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    if (!isExportGroupKey(ad.adKey)) {
      const metrics = emptyMetrics();
      for (const day of ad.days.values()) {
        const source = TOTAL_SOURCE_ORDER.find((type) => day.has(type));
        for (const row of source ? (day.get(source) ?? []) : []) addMetrics(metrics, row);
      }
      const signupSource = meta.get(adId(ad.platform, ad.adKey))?.signupSource ?? null;
      summaries.push({
        platform: ad.platform,
        adKey: ad.adKey,
        adName: ad.adName,
        firstDate,
        lastDate,
        ...roundYen(metrics),
        signupSource,
        funnel: signupSource
          ? (funnelBySource.get(signupSource) ?? { signups: 0, generated: 0, posted: 0 })
          : null,
      });
    }

    const byType = new Map<AdBreakdownType, Map<string, AdMetrics>>();
    for (const day of ad.days.values()) {
      for (const [type, list] of day) {
        if (type === "none") continue;
        const values = byType.get(type) ?? new Map<string, AdMetrics>();
        for (const row of list) {
          const metrics = values.get(row.breakdownValue) ?? emptyMetrics();
          addMetrics(metrics, row);
          values.set(row.breakdownValue, metrics);
        }
        byType.set(type, values);
      }
    }
    if (byType.size > 0) {
      groups.push({
        platform: ad.platform,
        adKey: ad.adKey,
        adName: ad.adName,
        firstDate,
        lastDate,
        breakdowns: TOTAL_SOURCE_ORDER.filter((type) => byType.has(type)).map((type) => {
          const values = byType.get(type)!;
          const total = [...values.values()].reduce((sum, m) => sum + m.spendJpy, 0);
          const items = [...values.entries()]
            .map(([value, metrics]) => ({
              value,
              ...roundYen(metrics),
              spendShare: total > 0 ? metrics.spendJpy / total : 0,
            }))
            .sort((a, b) => b.spendJpy - a.spendJpy || a.value.localeCompare(b.value, "ja"));
          return { type, items };
        }),
      });
    }
  }

  const totals = new Map<AdPlatform, AdMetrics>();
  for (const ad of summaries) {
    const metrics = totals.get(ad.platform) ?? emptyMetrics();
    addMetrics(metrics, ad);
    totals.set(ad.platform, metrics);
  }

  return {
    ads: summaries.sort(byLatestThenName),
    totals: [...totals.entries()].map(([platform, metrics]) => ({ platform, ...metrics })),
    groups: groups.sort(byLatestThenName),
  };
}

/** クリック率など。分母が 0 か、列が無いときは null */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

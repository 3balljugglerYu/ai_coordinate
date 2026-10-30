import { toJstDateKey } from "../dashboard-range";
import { GROWTH_MIN_SAMPLE } from "../growth-overview-types";
import { AD_PLATFORMS, type AdPlatform } from "./ad-stats-types";
import {
  addDays,
  ratio,
  type AdDailyTotal,
  type AdSummary,
  type SignupWindow,
} from "./summarize-ad-stats";

/**
 * 「広告の成果」のグラフの元を作る（DB を読まない計算だけ。画面からも読む）。
 *
 * 道のり: 媒体ごとに、クリック → ページを開いた → 登録 → 生成 → 投稿 の数を並べ、
 * 前の段から何割が進んだかを出す。前の段が30に届かない段は「まだ判断できません」にして、
 * いちばん落ちた段の候補から外す（管理画面全体の決まり・GROWTH_MIN_SAMPLE）。
 * 登録から先は目印ごとの人数なので、同じ目印の広告が何本あっても1回だけ数える。
 *
 * 日ごと: 使った額・クリック・登録を、日ごと・媒体ごとに並べる。広告の無い日も 0 で埋める。
 */

/** 日ごとのグラフに出す、いちばん長い日数 */
export const AD_DAILY_MAX_DAYS = 90;

export type AdFunnelStepKey = "linkClicks" | "landingPageViews" | "signups" | "generated" | "posted";

export const AD_FUNNEL_STEP_LABELS: Record<AdFunnelStepKey, string> = {
  linkClicks: "クリック",
  landingPageViews: "ページを開いた",
  signups: "登録",
  generated: "生成まで",
  posted: "投稿まで",
};

export interface AdFunnelStep {
  key: AdFunnelStepKey;
  /** クリックとページを開いたは回数、登録から先は人数 */
  unit: "回" | "人";
  value: number;
  /** 1回・1人あたりの使った額。数が0なら null */
  costPerUnitJpy: number | null;
  /** 前の段から進んだ割合。最初の段と、前の段が0のときは null */
  rateFromPrevious: number | null;
  /** 前の段の数が少なく、割合で判断できない（最初の段は false） */
  tooFewToJudge: boolean;
}

export interface PlatformFunnel {
  platform: AdPlatform;
  spendJpy: number;
  impressions: number;
  steps: AdFunnelStep[];
  /** 割合で判断できる段のうち、いちばん落ちた段。無ければ null */
  weakestStep: AdFunnelStepKey | null;
  adCount: number;
  /** 目印のある広告の数（0なら登録から先の段は出さない） */
  sourcedAdCount: number;
}

export function buildPlatformFunnels(
  ads: AdSummary[],
  minSample: number = GROWTH_MIN_SAMPLE,
): PlatformFunnel[] {
  return AD_PLATFORMS.flatMap((platform) => {
    const platformAds = ads.filter((ad) => ad.platform === platform);
    if (platformAds.length === 0) return [];

    const spendJpy = platformAds.reduce((sum, ad) => sum + ad.spendJpy, 0);
    const impressions = platformAds.reduce((sum, ad) => sum + ad.impressions, 0);
    const sumNullable = (pick: (ad: AdSummary) => number | null) =>
      platformAds.some((ad) => pick(ad) !== null)
        ? platformAds.reduce((sum, ad) => sum + (pick(ad) ?? 0), 0)
        : null;

    const values: Array<{ key: AdFunnelStepKey; unit: "回" | "人"; value: number }> = [];
    const linkClicks = sumNullable((ad) => ad.linkClicks);
    if (linkClicks !== null) values.push({ key: "linkClicks", unit: "回", value: linkClicks });
    const landingPageViews = sumNullable((ad) => ad.landingPageViews);
    if (landingPageViews !== null) {
      values.push({ key: "landingPageViews", unit: "回", value: landingPageViews });
    }

    // 同じ目印の広告は人数が合算なので、目印ごとに1回だけ足す
    const funnelBySource = new Map<string, NonNullable<AdSummary["funnel"]>>();
    for (const ad of platformAds) {
      if (ad.signupSource && ad.funnel) funnelBySource.set(ad.signupSource, ad.funnel);
    }
    const sourcedAdCount = platformAds.filter((ad) => ad.signupSource && ad.funnel).length;
    if (sourcedAdCount > 0) {
      const people = [...funnelBySource.values()];
      for (const key of ["signups", "generated", "posted"] as const) {
        values.push({ key, unit: "人", value: people.reduce((sum, f) => sum + f[key], 0) });
      }
    }

    const steps: AdFunnelStep[] = values.map((step, index) => {
      const previous = index > 0 ? values[index - 1].value : null;
      return {
        ...step,
        costPerUnitJpy: ratio(spendJpy, step.value),
        rateFromPrevious: previous === null ? null : ratio(step.value, previous),
        tooFewToJudge: previous !== null && previous < minSample,
      };
    });

    let weakestStep: AdFunnelStepKey | null = null;
    let weakestRate = Infinity;
    for (const step of steps) {
      if (step.rateFromPrevious === null || step.tooFewToJudge) continue;
      if (step.rateFromPrevious < weakestRate) {
        weakestRate = step.rateFromPrevious;
        weakestStep = step.key;
      }
    }

    return [
      {
        platform,
        spendJpy,
        impressions,
        steps,
        weakestStep,
        adCount: platformAds.length,
        sourcedAdCount,
      },
    ];
  });
}

export interface AdDailyRange {
  /** YYYY-MM-DD（日本時間・両端を含む） */
  from: string;
  to: string;
}

/**
 * 日ごとのグラフの期間。広告の最初の日から、最後の日の7日後（登録を数える期間の終わり）まで。
 * 今日より先は描かない。長すぎるときは、終わりから AD_DAILY_MAX_DAYS 日にする。
 */
export function adDailyRange(
  ads: AdSummary[],
  today: string,
  windowDaysAfter: number,
): AdDailyRange | null {
  if (ads.length === 0) return null;
  const first = ads.reduce((min, ad) => (ad.firstDate < min ? ad.firstDate : min), ads[0].firstDate);
  const last = ads.reduce((max, ad) => (ad.lastDate > max ? ad.lastDate : max), ads[0].lastDate);
  const afterLast = addDays(last, windowDaysAfter);
  const to = afterLast < today ? afterLast : today < last ? last : today;
  const earliest = addDays(to, -(AD_DAILY_MAX_DAYS - 1));
  return { from: first > earliest ? first : earliest, to };
}

export interface AdDailyChartRow {
  /** YYYY-MM-DD */
  day: string;
  metaSpend: number;
  xSpend: number;
  metaClicks: number;
  xClicks: number;
  metaSignups: number;
  xSignups: number;
}

/** 登録1人（目印と、日本時間の登録日） */
export interface AdSignupDay {
  signupSource: string;
  day: string;
}

/**
 * 読んだ登録から、日ごとのグラフに数えるものだけを残す。数え方は RPC get_ad_signup_funnel と
 * そろえる（目印ごとの期間・日本時間の日付・運営は除く）ので、日ごとの合計は道のりの登録と一致する。
 */
export function filterSignupDays(
  profiles: Array<{ userId: string; signupSource: string; createdAt: string }>,
  windows: SignupWindow[],
  excludedUserIds: string[],
): AdSignupDay[] {
  const excluded = new Set(excludedUserIds);
  const bySource = new Map(windows.map((window) => [window.signupSource, window]));
  return profiles.flatMap((profile) => {
    const window = bySource.get(profile.signupSource);
    const day = toJstDateKey(profile.createdAt);
    if (!window || excluded.has(profile.userId) || day < window.fromDate || day > window.toDate) {
      return [];
    }
    return [{ signupSource: profile.signupSource, day }];
  });
}

/**
 * 日ごとの行。広告の無い日も 0 で埋める。登録は、目印を選んだ広告の媒体に数える
 * （同じ目印が両方の媒体にあるときは、先に見つかった広告の媒体）。
 */
export function buildAdDailyRows(
  range: AdDailyRange,
  daily: AdDailyTotal[],
  signups: AdSignupDay[],
  ads: AdSummary[],
): AdDailyChartRow[] {
  const rows = new Map<string, AdDailyChartRow>();
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    rows.set(day, {
      day,
      metaSpend: 0,
      xSpend: 0,
      metaClicks: 0,
      xClicks: 0,
      metaSignups: 0,
      xSignups: 0,
    });
  }

  for (const total of daily) {
    const row = rows.get(total.day);
    if (!row) continue;
    row[`${total.platform}Spend`] += total.spendJpy;
    row[`${total.platform}Clicks`] += total.linkClicks ?? 0;
  }

  const platformBySource = new Map<string, AdPlatform>();
  for (const ad of ads) {
    if (ad.signupSource && !platformBySource.has(ad.signupSource)) {
      platformBySource.set(ad.signupSource, ad.platform);
    }
  }
  for (const signup of signups) {
    const row = rows.get(signup.day);
    const platform = platformBySource.get(signup.signupSource);
    if (row && platform) row[`${platform}Signups`] += 1;
  }

  return [...rows.values()];
}

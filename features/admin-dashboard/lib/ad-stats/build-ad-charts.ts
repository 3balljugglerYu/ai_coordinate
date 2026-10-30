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
 * 前の段から何割が進んだかを出す。分母が GROWTH_MIN_SAMPLE に届かない段は「まだ判断できません」に
 * して、いちばん落ちた段の候補から外す（管理画面全体の決まり）。
 * 登録から先は目印ごとの人数なので、同じ目印の広告が何本あっても1回だけ数える。
 * 割合と1回・1人あたりの額は、その段の数がある広告だけで出す（目印のない広告のクリックや、
 * ページを開いた数の無い広告のクリックを分母に入れない）。
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
  /** 1回・1人あたりの使った額（その段の数がある広告の額で割る）。数が0なら null */
  costPerUnitJpy: number | null;
  /**
   * 割合の分母。前の段の数を、この段の数がある広告だけで足したもの
   * （目印のない広告・ページを開いた数が無い広告を分母に入れない）。最初の段は null
   */
  previousValue: number | null;
  /** 前の段から進んだ割合。最初の段と、分母が0のときは null */
  rateFromPrevious: number | null;
  /** 分母が少なく、割合で判断できない（最初の段は false） */
  tooFewToJudge: boolean;
}

export interface PlatformFunnel {
  platform: AdPlatform;
  spendJpy: number;
  impressions: number;
  /** クリック率（クリックの数がある広告だけで割る） */
  clickRate: number | null;
  steps: AdFunnelStep[];
  /** 割合で判断できる段のうち、いちばん落ちた段。無ければ null */
  weakestStep: AdFunnelStepKey | null;
  adCount: number;
  /** 登録から先の人数をこの媒体に数える広告の数（0なら登録から先の段は出さない） */
  sourcedAdCount: number;
}

/**
 * 目印をどの媒体に数えるか。人数は目印ごとにしか分からないので、同じ目印が
 * 両方の媒体の広告にあっても、1つの媒体にだけ数える（ads の並びで先に見つかった広告の媒体）。
 * 道のりと日ごとのグラフで同じ決まりを使い、媒体どうしで二重に数えない。
 */
export function signupSourcePlatforms(ads: AdSummary[]): Map<string, AdPlatform> {
  const platforms = new Map<string, AdPlatform>();
  for (const ad of ads) {
    if (ad.signupSource && !platforms.has(ad.signupSource)) {
      platforms.set(ad.signupSource, ad.platform);
    }
  }
  return platforms;
}

function sumOf(ads: AdSummary[], pick: (ad: AdSummary) => number | null): number {
  return ads.reduce((sum, ad) => sum + (pick(ad) ?? 0), 0);
}

const AD_STEP_PICK: Record<"linkClicks" | "landingPageViews", (ad: AdSummary) => number | null> = {
  linkClicks: (ad) => ad.linkClicks,
  landingPageViews: (ad) => ad.landingPageViews,
};

export function buildPlatformFunnels(
  ads: AdSummary[],
  minSample: number = GROWTH_MIN_SAMPLE,
): PlatformFunnel[] {
  const sourcePlatforms = signupSourcePlatforms(ads);
  return AD_PLATFORMS.flatMap((platform) => {
    const platformAds = ads.filter((ad) => ad.platform === platform);
    if (platformAds.length === 0) return [];

    const clickAds = platformAds.filter((ad) => ad.linkClicks !== null);
    const pageViewAds = platformAds.filter((ad) => ad.landingPageViews !== null);
    // 登録から先の人数をこの媒体に数える広告
    const sourcedAds = platformAds.filter(
      (ad) =>
        ad.signupSource && ad.funnel && sourcePlatforms.get(ad.signupSource) === platform,
    );

    const drafts: Array<{
      key: AdFunnelStepKey;
      unit: "回" | "人";
      value: number;
      previousValue: number | null;
      spendJpy: number;
    }> = [];
    if (clickAds.length > 0) {
      drafts.push({
        key: "linkClicks",
        unit: "回",
        value: sumOf(clickAds, AD_STEP_PICK.linkClicks),
        previousValue: null,
        spendJpy: sumOf(clickAds, (ad) => ad.spendJpy),
      });
    }
    if (pageViewAds.length > 0) {
      drafts.push({
        key: "landingPageViews",
        unit: "回",
        value: sumOf(pageViewAds, AD_STEP_PICK.landingPageViews),
        previousValue: clickAds.length > 0 ? sumOf(pageViewAds, AD_STEP_PICK.linkClicks) : null,
        spendJpy: sumOf(pageViewAds, (ad) => ad.spendJpy),
      });
    }
    if (sourcedAds.length > 0) {
      // 同じ目印の広告は人数が合算なので、目印ごとに1回だけ足す
      const people = new Map<string, NonNullable<AdSummary["funnel"]>>();
      for (const ad of sourcedAds) people.set(ad.signupSource!, ad.funnel!);
      const total = (key: "signups" | "generated" | "posted") =>
        [...people.values()].reduce((sum, funnel) => sum + funnel[key], 0);
      const lastAdStep = drafts.at(-1);
      const sourcedSpend = sumOf(sourcedAds, (ad) => ad.spendJpy);
      drafts.push(
        {
          key: "signups",
          unit: "人",
          value: total("signups"),
          previousValue: lastAdStep
            ? sumOf(sourcedAds, AD_STEP_PICK[lastAdStep.key as "linkClicks" | "landingPageViews"])
            : null,
          spendJpy: sourcedSpend,
        },
        {
          key: "generated",
          unit: "人",
          value: total("generated"),
          previousValue: total("signups"),
          spendJpy: sourcedSpend,
        },
        {
          key: "posted",
          unit: "人",
          value: total("posted"),
          previousValue: total("generated"),
          spendJpy: sourcedSpend,
        },
      );
    }

    const steps: AdFunnelStep[] = drafts.map((draft) => ({
      key: draft.key,
      unit: draft.unit,
      value: draft.value,
      costPerUnitJpy: ratio(draft.spendJpy, draft.value),
      previousValue: draft.previousValue,
      rateFromPrevious:
        draft.previousValue === null ? null : ratio(draft.value, draft.previousValue),
      tooFewToJudge: draft.previousValue !== null && draft.previousValue < minSample,
    }));

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
        spendJpy: sumOf(platformAds, (ad) => ad.spendJpy),
        impressions: sumOf(platformAds, (ad) => ad.impressions),
        clickRate: ratio(
          sumOf(clickAds, AD_STEP_PICK.linkClicks),
          sumOf(clickAds, (ad) => ad.impressions),
        ),
        steps,
        weakestStep,
        adCount: platformAds.length,
        sourcedAdCount: sourcedAds.length,
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
 * そろえる（目印ごとの期間・日本時間の日付・運営は除く）ので、グラフの期間に収まる広告なら、
 * 日ごとの合計は道のりの登録と一致する。数え方を変えるときは、RPC と両方を直す。
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
 * 日ごとの行。広告の無い日も 0 で埋める。登録は、道のりと同じ決まり（signupSourcePlatforms）で
 * 1つの媒体にだけ数える。
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

  const platformBySource = signupSourcePlatforms(ads);
  for (const signup of signups) {
    const row = rows.get(signup.day);
    const platform = platformBySource.get(signup.signupSource);
    if (row && platform) row[`${platform}Signups`] += 1;
  }

  return [...rows.values()];
}

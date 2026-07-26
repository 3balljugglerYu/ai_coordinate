import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  isWithinDateRange,
  toJstDateKey,
} from "./dashboard-range";
import {
  getModelRate,
  PROVIDER_LABELS,
  USD_JPY_RATE_NOTE,
  usdToJpy,
  type AiCostProvider,
} from "./ai-cost-rates";
import type {
  DashboardAiCostEstimate,
  DashboardAiCostDayPoint,
  DashboardAiCostModelItem,
} from "./dashboard-types";

type GenerationLike = {
  model: string | null;
  created_at: string;
};

/**
 * 期間内の生成記録から推定 AI 原価を集計する（ADR-001）。
 *
 * 日別バケットは JST。単価表に無いモデル（旧データの null を含む）は
 * 金額に含めず件数だけ返し、カード側で「単価未設定」として明示する。
 */
export function buildAiCostEstimate(
  generations: GenerationLike[],
  currentStart: Date,
  now: Date
): DashboardAiCostEstimate {
  const dayKeys = enumerateJstDateKeys(currentStart, now);
  const dayMap = new Map<string, DashboardAiCostDayPoint>(
    dayKeys.map((key) => [
      key,
      {
        bucket: key,
        label: formatJstDateLabel(key),
        openaiJpy: 0,
        googleJpy: 0,
        totalJpy: 0,
      },
    ])
  );

  const modelUsdTotals = new Map<
    string,
    { provider: AiCostProvider; count: number; usd: number }
  >();

  let totalUsd = 0;
  let unknownModelCount = 0;

  for (const generation of generations) {
    if (!isWithinDateRange(generation.created_at, currentStart, now)) {
      continue;
    }

    const rate = getModelRate(generation.model);

    if (!rate) {
      unknownModelCount += 1;
      continue;
    }

    totalUsd += rate.unitCostUsd;

    const modelKey = generation.model as string;
    const modelTotal = modelUsdTotals.get(modelKey) ?? {
      provider: rate.provider,
      count: 0,
      usd: 0,
    };
    modelTotal.count += 1;
    modelTotal.usd += rate.unitCostUsd;
    modelUsdTotals.set(modelKey, modelTotal);

    const bucket = dayMap.get(toJstDateKey(generation.created_at));
    if (bucket) {
      const jpy = usdToJpy(rate.unitCostUsd);
      if (rate.provider === "openai") {
        bucket.openaiJpy += jpy;
      } else {
        bucket.googleJpy += jpy;
      }
      bucket.totalJpy += jpy;
    }
  }

  const days = dayKeys.map((key) => {
    const point = dayMap.get(key)!;
    return {
      ...point,
      openaiJpy: roundJpy(point.openaiJpy),
      googleJpy: roundJpy(point.googleJpy),
      totalJpy: roundJpy(point.totalJpy),
    };
  });

  const byModel: DashboardAiCostModelItem[] = Array.from(
    modelUsdTotals.entries()
  )
    .map(([model, total]) => ({
      model,
      provider: total.provider,
      providerLabel: PROVIDER_LABELS[total.provider],
      count: total.count,
      totalUsd: Number(total.usd.toFixed(4)),
      totalJpy: roundJpy(usdToJpy(total.usd)),
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return {
    totalUsd: Number(totalUsd.toFixed(4)),
    totalJpy: roundJpy(usdToJpy(totalUsd)),
    days,
    byModel,
    unknownModelCount,
    rateNote: USD_JPY_RATE_NOTE,
  };
}

function roundJpy(value: number): number {
  return Math.round(value * 10) / 10;
}

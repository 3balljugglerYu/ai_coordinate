import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  isWithinDateRange,
  toJstDateKey,
} from "./dashboard-range";
import {
  estimateGenerationCost,
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
  /**
   * プロンプトの推定トークン数を引くために使う。
   * 未指定なら既定値（coordinate 相当）で見積もる。
   */
  generation_type?: string | null;
};

/**
 * 期間内の生成記録から推定 AI 原価を集計する（ADR-001 / ADR-005）。
 *
 * 1生成の原価は「出力画像 ＋ 入力画像 ＋ プロンプト」の合計で数える。
 * 出力ぶんだけを数えていた頃は、One-Tap Style の Low で実額の 1/3 しか
 * 出ていなかった（入力ぶんが原価の7割を占めるため）。
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

    const cost = estimateGenerationCost(
      generation.model,
      generation.generation_type ?? null
    );

    if (!cost) {
      unknownModelCount += 1;
      continue;
    }

    totalUsd += cost.usd;

    const modelKey = generation.model as string;
    const modelTotal = modelUsdTotals.get(modelKey) ?? {
      provider: cost.provider,
      count: 0,
      usd: 0,
    };
    modelTotal.count += 1;
    modelTotal.usd += cost.usd;
    modelUsdTotals.set(modelKey, modelTotal);

    const bucket = dayMap.get(toJstDateKey(generation.created_at));
    if (bucket) {
      const jpy = usdToJpy(cost.usd);
      if (cost.provider === "openai") {
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

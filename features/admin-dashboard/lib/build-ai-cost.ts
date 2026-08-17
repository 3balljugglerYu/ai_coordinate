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
  type AiInputCompleteness,
  type AiRateBasis,
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
   * 見積もり精度がこれに依存するので**必須**にしてある（旧データは null）。
   */
  generation_type: string | null;
  /**
   * 入力ぶんをジョブ単位で1回だけ数えるために使う。
   * `null` は同期経路・旧データで、その行だけで1リクエストとみなす。
   */
  image_job_id?: string | null;
  /**
   * 完走フィード投稿(台紙の合成画像)は `completion_id` を持つ。
   * **AI 生成ではない**ので原価は 0 が正しく、「単価未設定」にも数えない。
   * (直近60日の model=NULL 51件のうち 47件がこれだった)
   */
  completion_id?: string | null;
};

/**
 * 期間内の生成記録から推定 AI 原価を集計する（ADR-001 / ADR-005 / ADR-008）。
 *
 * ## 数え方
 *
 * 1リクエストの原価は「出力画像 × 枚数 ＋ 入力画像 ＋ プロンプト」。
 * 出力ぶんだけを数えていた頃は、One-Tap Style の Low で実額の 1/3 しか
 * 出ていなかった（入力ぶんが原価の7割を占めるため）。
 *
 * ## 入力ぶんは画像の行数ぶん掛けてはいけない
 *
 * OpenAI 経路は `requested_image_count` を `n` として **1リクエストで複数枚**返し、
 * そのあと RPC が枚数ぶんの `generated_images` を作る。`usage` はレスポンス単位の
 * 1オブジェクトなので、入力画像とプロンプトの課金は**リクエストにつき1回**。
 * 行ごとに足すと 4枚生成で入力ぶんが4倍に膨らむ。
 * そのため `image_job_id` 単位で入力ぶんを1度だけ積む。
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
    {
      provider: AiCostProvider;
      basis: AiRateBasis;
      inputCompleteness: AiInputCompleteness;
      count: number;
      usd: number;
    }
  >();

  let totalUsd = 0;
  let unknownModelCount = 0;
  /** 入力ぶんを既に積んだジョブ。同じリクエストで返った2枚目以降は出力ぶんだけ数える。 */
  const jobsWithInputCounted = new Set<string>();

  for (const generation of generations) {
    if (!isWithinDateRange(generation.created_at, currentStart, now)) {
      continue;
    }

    /*
      完走フィード投稿は台紙画像を合成して作る行で、モデルを呼んでいない。
      これを「単価未設定」に数えると、実際には穴が無いのに
      「原価を取りこぼしている件数」がカードに出て判断を誤らせる。
    */
    if (generation.completion_id) {
      continue;
    }

    const cost = estimateGenerationCost(
      generation.model,
      generation.generation_type
    );

    if (!cost) {
      unknownModelCount += 1;
      continue;
    }

    // image_job_id が無い行(同期経路・旧データ)は、その行だけで1リクエスト扱い
    const jobId = generation.image_job_id ?? null;
    const isFirstOfJob = jobId === null || !jobsWithInputCounted.has(jobId);
    if (jobId !== null) {
      jobsWithInputCounted.add(jobId);
    }

    const usd = cost.outputUsd + (isFirstOfJob ? cost.inputUsd : 0);

    totalUsd += usd;

    const modelKey = generation.model as string;
    const modelTotal = modelUsdTotals.get(modelKey) ?? {
      provider: cost.provider,
      basis: cost.basis,
      inputCompleteness: cost.inputCompleteness,
      count: 0,
      usd: 0,
    };
    modelTotal.count += 1;
    modelTotal.usd += usd;
    modelUsdTotals.set(modelKey, modelTotal);

    const bucket = dayMap.get(toJstDateKey(generation.created_at));
    if (bucket) {
      const jpy = usdToJpy(usd);
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
      basis: total.basis,
      inputCompleteness: total.inputCompleteness,
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

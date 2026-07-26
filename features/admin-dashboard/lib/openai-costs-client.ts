import "server-only";

import { env } from "@/lib/env";
import { usdToJpy } from "./ai-cost-rates";
import type { AiCostActualEntry } from "./ai-cost-actual-types";

const COSTS_ENDPOINT = "https://api.openai.com/v1/organization/costs";
const REQUEST_TIMEOUT_MS = 10_000;
/** バケットは 1 日単位。API 上限は 180 */
const MAX_BUCKETS = 180;

interface OpenAiCostsBucketResult {
  amount?: { value?: number; currency?: string };
}

interface OpenAiCostsBucket {
  results?: OpenAiCostsBucketResult[];
}

interface OpenAiCostsResponse {
  data?: OpenAiCostsBucket[];
  has_more?: boolean;
  next_page?: string | null;
}

export function isOpenAiCostsConfigured(): boolean {
  return Boolean(env.OPENAI_ADMIN_API_KEY);
}

/**
 * OpenAI Costs API から期間内の実請求額を取得する。
 *
 * 画像生成以外の API 利用も含む「組織全体の課金額」である点に注意
 * （推定＝画像のみ、実額＝全用途。カード側で注記する）。
 */
export async function fetchOpenAiActualCost(
  start: Date,
  end: Date
): Promise<AiCostActualEntry> {
  const base: Omit<AiCostActualEntry, "status" | "message"> = {
    provider: "openai",
    providerLabel: "OpenAI",
    totalJpy: null,
    totalOriginal: null,
    originalCurrency: null,
  };

  if (!isOpenAiCostsConfigured()) {
    return { ...base, status: "not_configured", message: null };
  }

  const params = new URLSearchParams({
    start_time: String(Math.floor(start.getTime() / 1000)),
    end_time: String(Math.floor(end.getTime() / 1000)),
    bucket_width: "1d",
    limit: String(MAX_BUCKETS),
  });

  try {
    const response = await fetch(`${COSTS_ENDPOINT}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_ADMIN_API_KEY}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      // キー自体はログにも表示にも載せない
      return {
        ...base,
        status: "error",
        message: `OpenAI Costs API エラー (${response.status})`,
      };
    }

    const payload = (await response.json()) as OpenAiCostsResponse;
    const { totalUsd, currency } = sumOpenAiCosts(payload);

    return {
      ...base,
      status: "ready",
      message: null,
      totalOriginal: Number(totalUsd.toFixed(4)),
      originalCurrency: currency,
      totalJpy: Math.round(usdToJpy(totalUsd) * 10) / 10,
    };
  } catch (error) {
    console.error("OpenAI costs fetch error:", error);
    return {
      ...base,
      status: "error",
      message: "OpenAI の実額を取得できませんでした",
    };
  }
}

/**
 * バケット配列を合計する。通貨は最初に見つかったものを採用（通常 usd 固定）。
 */
export function sumOpenAiCosts(payload: OpenAiCostsResponse): {
  totalUsd: number;
  currency: string;
} {
  let totalUsd = 0;
  let currency = "usd";

  for (const bucket of payload.data ?? []) {
    for (const result of bucket.results ?? []) {
      const value = result.amount?.value;
      if (typeof value === "number" && Number.isFinite(value)) {
        totalUsd += value;
      }
      if (result.amount?.currency) {
        currency = result.amount.currency;
      }
    }
  }

  return { totalUsd, currency };
}

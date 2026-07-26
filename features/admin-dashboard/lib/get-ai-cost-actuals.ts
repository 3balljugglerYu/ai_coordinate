import "server-only";

import { getRangeBounds } from "./dashboard-range";
import type { DashboardRange } from "./dashboard-range";
import { fetchOpenAiActualCost } from "./openai-costs-client";
import { fetchGeminiActualCost } from "./gemini-billing-client";
import type { AiCostActualEntry, AiCostActuals } from "./ai-cost-actual-types";

/**
 * 各プロバイダの実請求額をまとめて取得する（ADR-004）。
 *
 * プロバイダごとに独立して成功/失敗できるよう allSettled を使い、
 * 片方が落ちてももう片方と推定表示は生き残る。
 */
export async function getAiCostActuals(
  range: DashboardRange
): Promise<AiCostActuals> {
  const { currentStart, now } = getRangeBounds(range);

  const results = await Promise.allSettled([
    fetchOpenAiActualCost(currentStart, now),
    fetchGeminiActualCost(currentStart, now),
  ]);

  const entries: AiCostActualEntry[] = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.error("AI cost actual fetch rejected:", result.reason);

    return {
      provider: index === 0 ? "openai" : "google",
      providerLabel: index === 0 ? "OpenAI" : "Google",
      status: "error" as const,
      totalJpy: null,
      totalOriginal: null,
      originalCurrency: null,
      message: "実額を取得できませんでした",
    };
  });

  return {
    entries,
    hasAnyConfigured: entries.some((entry) => entry.status !== "not_configured"),
  };
}

import { AlertTriangle } from "lucide-react";
import type { AiCostActuals } from "../lib/ai-cost-actual-types";
import { PROVIDER_CHART_COLORS } from "../lib/ai-cost-rates";

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

interface AdminAiCostActualRowProps {
  actuals: AiCostActuals;
}

/**
 * 実額（各プラットフォームの請求額）の併記行。
 * 未設定のプロバイダは行ごと出さず、失敗時のみ注意表示にする（ADR-002）。
 */
export function AdminAiCostActualRow({ actuals }: AdminAiCostActualRowProps) {
  if (!actuals.hasAnyConfigured) {
    return null;
  }

  const visibleEntries = actuals.entries.filter(
    (entry) => entry.status !== "not_configured"
  );

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">
        実額（各プラットフォームの請求額・画像以外の API 利用も含む）
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {visibleEntries.map((entry) => (
          <div key={entry.provider} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{
                backgroundColor: PROVIDER_CHART_COLORS[entry.provider],
              }}
            />
            <span className="text-sm text-slate-600">
              {entry.providerLabel}:
            </span>
            {entry.status === "ready" && entry.totalJpy !== null ? (
              <span className="text-sm font-semibold text-slate-900">
                {formatJpy(entry.totalJpy)}
                {entry.totalOriginal !== null ? (
                  <span className="ml-1 font-normal text-slate-500">
                    (${entry.totalOriginal.toFixed(2)})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {entry.message ?? "取得できませんでした"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

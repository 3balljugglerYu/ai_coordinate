"use client";

import { useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FreePercoinBatchExpiring } from "../lib/api";

function formatExpireLabel(expireAt: string): string {
  const d = new Date(expireAt);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日迄`;
}

/** 有効期限日ごとに残高を合算（有効期限が近い順） */
function groupByExpireDate(
  batches: FreePercoinBatchExpiring[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of batches) {
    const key = formatExpireLabel(b.expire_at);
    map.set(key, (map.get(key) ?? 0) + b.remaining_amount);
  }
  return map;
}

interface PeriodLimitedBreakdownProps {
  batches: FreePercoinBatchExpiring[];
  periodLimitedTotal: number;
  onToggle: (expanded: boolean) => void;
  isExpanded: boolean;
  /** "row": カード内のタップ行のみ / "expanded": 展開コンテンツのみ（Linkの外） */
  variant: "row" | "expanded";
}

export function PeriodLimitedBreakdown({
  batches,
  periodLimitedTotal,
  onToggle,
  isExpanded,
  variant,
}: PeriodLimitedBreakdownProps) {
  const grouped = groupByExpireDate(batches);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(!isExpanded);
    },
    [isExpanded, onToggle]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle(!isExpanded);
      }
    },
    [isExpanded, onToggle]
  );

  if (variant === "row") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "期間限定の内訳を閉じる" : "期間限定の内訳を開く"}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`flex min-h-[44px] cursor-pointer items-center justify-between rounded py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          periodLimitedTotal > 0 ? "" : "pointer-events-none opacity-70"
        }`}
      >
        <span>うち期間限定</span>
        <span className="flex items-center gap-1">
          <span>{periodLimitedTotal.toLocaleString()}</span>
          {periodLimitedTotal > 0 &&
            (isExpanded ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            ))}
        </span>
      </div>
    );
  }

  // variant === "expanded"
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <p className="mb-3 text-xs font-medium text-gray-500">
        期間限定ペルコインの内訳（有効期限が近い順）
      </p>
      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([expireLabel, totalAmount]) => (
          <div
            key={expireLabel}
            className="flex items-center justify-between text-sm text-gray-600"
          >
            <p className="font-medium text-gray-700">{expireLabel}</p>
            <span className="font-medium">{totalAmount.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

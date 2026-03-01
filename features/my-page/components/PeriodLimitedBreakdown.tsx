"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FreePercoinBatchExpiring } from "../lib/api";

const SOURCE_LABELS: Record<string, string> = {
  signup_bonus: "新規登録ボーナス",
  tour_bonus: "チュートリアルボーナス",
  referral: "紹介ボーナス",
  daily_post: "デイリー投稿ボーナス",
  streak: "連続ログインボーナス",
  admin_bonus: "運営者からのボーナス",
  refund: "生成失敗返却",
};

function formatSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatExpireMonth(expireAt: string): string {
  const d = new Date(expireAt);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日迄`;
}

/** 月ごとにグループ化（有効期限が近い順） */
function groupByExpireMonth(
  batches: FreePercoinBatchExpiring[]
): Map<string, FreePercoinBatchExpiring[]> {
  const map = new Map<string, FreePercoinBatchExpiring[]>();
  for (const b of batches) {
    const key = formatExpireMonth(b.expire_at);
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
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
  const grouped = groupByExpireMonth(batches);

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
        className={`flex min-h-[44px] cursor-pointer items-center justify-between py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded ${
          periodLimitedTotal > 0 ? "" : "pointer-events-none opacity-70"
        }`}
      >
        <span>うち期間限定</span>
        <span className="flex items-center gap-1">
          {periodLimitedTotal.toLocaleString()}
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
        {Array.from(grouped.entries()).map(([expireLabel, items]) => (
          <div key={expireLabel}>
            <p className="mb-2 text-sm font-medium text-gray-700">
              {expireLabel}
            </p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between text-sm text-gray-600"
                >
                  <span>{formatSource(item.source)}</span>
                  <span className="font-medium">
                    {item.remaining_amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

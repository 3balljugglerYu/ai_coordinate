"use client";

import { cn } from "@/lib/utils";

export type SortType = "newest" | "following" | "daily" | "week" | "month" | "popular";

interface SortTabsProps {
  value: SortType;
  onChange: (value: SortType) => void;
  currentUserId?: string | null;
}

export function SortTabs({ value, onChange, currentUserId }: SortTabsProps) {
  const tabs: { value: SortType; label: string; disabled?: boolean }[] = [
    { value: "newest", label: "新着" },
    { value: "week", label: "オススメ" },
    { value: "following", label: "フォロー" },
    // { value: "daily", label: "Daily" },
    // { value: "month", label: "Monthly" },
    // { value: "popular", label: "いいね" }, // 検索画面でのみ使用
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => !tab.disabled && onChange(tab.value)}
          disabled={tab.disabled}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "border-b-2",
            value === tab.value
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
            tab.disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

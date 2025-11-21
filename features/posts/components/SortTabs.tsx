"use client";

import { cn } from "@/lib/utils";

export type SortType = "newest" | "daily" | "week" | "month";

interface SortTabsProps {
  value: SortType;
  onChange: (value: SortType) => void;
}

export function SortTabs({ value, onChange }: SortTabsProps) {
  const tabs: { value: SortType; label: string; disabled?: boolean }[] = [
    { value: "newest", label: "新着" },
    { value: "daily", label: "dailyいいね総数", disabled: true }, // Phase 4で実装予定
    { value: "week", label: "weekいいね総数", disabled: true }, // Phase 4で実装予定
    { value: "month", label: "monthいいね総数", disabled: true }, // Phase 4で実装予定
  ];

  return (
    <div className="flex gap-2 overflow-x-auto border-b">
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


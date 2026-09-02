"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SortType } from "../types";
import { usePopularPromptsAvailable } from "./PopularPromptsAvailabilityProvider";

interface SortTabsProps {
  value: SortType;
  onChange: (value: SortType) => void;
  currentUserId?: string | null;
}

export function SortTabs({ value, onChange, currentUserId }: SortTabsProps) {
  const postsT = useTranslations("posts");
  const popularPromptsAvailable = usePopularPromptsAvailable();

  /*
    ⭐ 中間タブは「追加」ではなく「差し替え」。
    🔥人気を足すだけにすると、week が残っている全公開前のあいだ運営には
    4 タブが並び、モバイル幅で折り返す。差し替えにすれば、見えるタブは常に 3 つで、
    フラグを閉じ直せば一般ユーザーにはオススメ(week)が復帰する。
    week を消す Phase 6 で、この分岐ごと畳んで popular_prompts 固定にする。
  */
  const middleTab: { value: SortType; label: string } = popularPromptsAvailable
    ? { value: "popular_prompts", label: postsT("popularPrompts") }
    : { value: "week", label: postsT("recommended") };

  const tabs: { value: SortType; label: string; disabled?: boolean }[] = [
    { value: "newest", label: postsT("newest") },
    middleTab,
    { value: "following", label: postsT("following") },
    // { value: "daily", label: "Daily" },
    // { value: "month", label: "Monthly" },
    // { value: "popular", label: "いいね" }, // 検索画面でのみ使用
  ];

  return (
    // 下線(border-b)は親(PostList)が表示形式トグルと同じ行に引くため、ここでは持たない
    <div className="flex flex-wrap gap-2">
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

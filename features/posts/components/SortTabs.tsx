"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SortType } from "../types";
import { usePopularPromptsAvailable } from "./PopularPromptsAvailabilityProvider";

interface SortTabsProps {
  value: SortType;
  onChange: (value: SortType) => void;
  currentUserId?: string | null;
  /**
   * サーバーで確定した可否。渡された場合はこちらを使う。
   *
   * ⭐ context の初期値は公開フラグ（段階公開中は false）で、Loader が遅れて
   * 昇格させる。ホームは既定タブをサーバーで決めているので、context の昇格を
   * 待つと**初回描画でどのタブも選択されていない状態**になる。
   */
  popularPromptsAvailable?: boolean;
}

export function SortTabs({
  value,
  onChange,
  currentUserId,
  popularPromptsAvailable: popularPromptsAvailableProp,
}: SortTabsProps) {
  const postsT = useTranslations("posts");
  const availableFromContext = usePopularPromptsAvailable();
  const popularPromptsAvailable =
    popularPromptsAvailableProp ?? availableFromContext;

  /*
    ⭐ タブは「追加」ではなく「差し替え」。PICK UP を足すだけにすると、
    week が残っている全公開前のあいだ運営には 4 タブが並び、モバイル幅で折り返す。
    差し替えにすれば見えるタブは常に 3 つで、フラグを閉じ直せば一般ユーザーには
    オススメ(week)が復帰する。week を消す Phase 6 で、この分岐ごと畳める。

    ⭐ 並び順も可否で変える。PICK UP が使えるなら**先頭**（既定タブなので、
    選択中のタブが左端に来る）。使えないなら従来どおり 新着 → オススメ → フォロー。
  */
  const tabs: { value: SortType; label: string; disabled?: boolean }[] =
    popularPromptsAvailable
      ? [
          { value: "popular_prompts", label: postsT("popularPrompts") },
          { value: "newest", label: postsT("newest") },
          { value: "following", label: postsT("following") },
        ]
      : [
          { value: "newest", label: postsT("newest") },
          { value: "week", label: postsT("recommended") },
          { value: "following", label: postsT("following") },
        ];
  // { value: "daily", label: "Daily" },
  // { value: "month", label: "Monthly" },
  // { value: "popular", label: "いいね" }, // 検索画面でのみ使用

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

"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { HOME_VIEW_MODES, type HomeViewMode } from "../lib/home-view-preference";
import { HOME_VIEW_TOGGLE_TOUR_ID } from "./HomeViewSwitchNotice";

interface HomeViewToggleProps {
  value: HomeViewMode;
  onChange: (value: HomeViewMode) => void;
  /** 新機能に気づいてもらうためのバッジ(初回フィード表示で消える) */
  showNewBadge?: boolean;
}

/**
 * ホームの「表示形式」を切り替えるアイコントグル。
 *
 * タブ(新着/オススメ/フォロー)が「何を見るか」であるのに対し、
 * こちらは「どう見るか」を選ぶ。両者は独立しており、タブを移動しても
 * 表示形式は維持される。
 */
export function HomeViewToggle({ value, onChange, showNewBadge = false }: HomeViewToggleProps) {
  const postsT = useTranslations("posts");

  const options: { mode: HomeViewMode; label: string; Icon: typeof LayoutGrid }[] = [
    { mode: HOME_VIEW_MODES.grid, label: postsT("viewModeGrid"), Icon: LayoutGrid },
    { mode: HOME_VIEW_MODES.feed, label: postsT("viewModeFeed"), Icon: Rows3 },
  ];

  return (
    <div
      // 既定をフィードへ切り替えた案内のスポットライトが、ここを指す
      data-tour-id={HOME_VIEW_TOGGLE_TOUR_ID}
      className="relative flex shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-0.5"
    >
      {options.map(({ mode, label, Icon }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={cn(
              // 指で押せる大きさにする(44px 目安)。アイコンだけの小さな的だと
              // 押し損ねて「反応しない」と受け取られる
              "flex h-9 w-11 items-center justify-center rounded-full transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        );
      })}
      {showNewBadge && (
        <span
          /*
            右端は枠の内側に揃える(right-0)。負の値で外へ出すと、この行は
            画面の右端にあるためページの余白へはみ出して切れて見える。
            上方向だけ少し出して、フィード(▤)側の角に載せる。
          */
          className="pointer-events-none absolute right-0 -top-2 whitespace-nowrap rounded-full bg-primary px-1.5 py-px text-[9px] font-bold leading-tight text-primary-foreground shadow-sm"
          aria-hidden="true"
        >
          {postsT("viewModeNewBadge")}
        </span>
      )}
    </div>
  );
}

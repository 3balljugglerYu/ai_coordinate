"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** カタログのタブ1つ分。 */
export interface CatalogTab<T extends string = string> {
  id: T;
  /** 表示名。読み上げにも使うので、先頭の絵文字もここに含める。 */
  label: string;
  /** 表示名の前に出すアイコン(User ORIGINAL の作者アバターなど)。 */
  icon?: ReactNode;
}

/** 下線がスライドするときの動き(OriginalKindTabs のピルと同じ曲線)。 */
const INDICATOR_TRANSITION =
  "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isRtl(element: HTMLElement): boolean {
  return element.closest("[dir]")?.getAttribute("dir") === "rtl";
}

/**
 * スタイルカタログ(`/styles`・`/user-styles`)の絞り込みタブ。
 * カタログ刷新(段階公開中は運営のみ)で、これまでのチップ列の代わりに出す。
 *
 * 見た目は一般的なアプリのタブの形を、ペルスタの白い画面と配色にしたもの。
 *  - 選択中は濃い文字、ほかはグレー。太さは全タブ同じにして、切り替えで幅が変わらないようにする
 *  - 選択中の文字の下に、ピンク→オレンジの線(上の `OriginalKindTabs` と同じ配色)。
 *    切り替えると横へスライドする
 *  - はみ出す分は横スクロール。続きがある側の端を白くぼかして示す(スクロールバーは出さない)
 *  - 選択中が変わったら、そのタブをタブ列の真ん中へ寄せる。一覧のスワイプで
 *    画面の外のタブへ移ったときも、どこにいるかが見えるようにするため
 *
 * 下線とぼかしは、スクロールや切り替えのたびに再レンダリングしないよう、
 * DOM の style を直接更新する(`useHorizontalScrollIndicator` と同じ考え方)。
 *
 * 一覧の横スワイプでの切り替えは `CatalogSwipePanel` が受け持つ。
 */
export function CatalogTabBar<T extends string>({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
}: {
  tabs: CatalogTab<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const startFadeRef = useRef<HTMLSpanElement | null>(null);
  const endFadeRef = useRef<HTMLSpanElement | null>(null);
  const previousActiveIdRef = useRef(activeId);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  // タブの構成が変わったとき(作者タブの後乗せ・言語の切り替えなど)に測り直すための鍵
  const tabsKey = tabs.map((tab) => `${tab.id}\u0000${tab.label}`).join("\u0001");

  // 下線を、選択中のタブの文字(アイコン込み)の真下へ置く。幅の変化にも追従する。
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) {
      return;
    }
    const place = () => {
      const tab = list.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex];
      const label = tab?.querySelector<HTMLElement>("[data-tab-label]");
      if (!label) {
        indicator.style.opacity = "0";
        return;
      }
      // offsetLeft はタブ列(position: relative)の中での位置で、横スクロールしても変わらない。
      // 下線もタブ列の中に置いているので、そのまま一緒にスクロールする。
      indicator.style.transform = `translateX(${label.offsetLeft}px)`;
      indicator.style.width = `${label.offsetWidth}px`;
      indicator.style.opacity = "1";
    };
    place();
    // 最初の1回はスライドさせない(左端から滑ってくる不自然な動きを防ぐ)
    const frame = requestAnimationFrame(() => {
      indicator.style.transition = prefersReducedMotion()
        ? ""
        : INDICATOR_TRANSITION;
    });
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeIndex, tabsKey]);

  // はみ出しがあるとき、続きがある側の端をぼかす。
  useEffect(() => {
    const list = listRef.current;
    const startFade = startFadeRef.current;
    const endFade = endFadeRef.current;
    if (!list || !startFade || !endFade) {
      return;
    }
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const overflow = list.scrollWidth - list.clientWidth;
      // 右から左へ並ぶ言語では scrollLeft が 0 以下になるので、絶対値で見る
      const scrolled = Math.abs(list.scrollLeft);
      startFade.style.opacity = overflow > 1 && scrolled > 1 ? "1" : "0";
      endFade.style.opacity =
        overflow > 1 && scrolled < overflow - 1 ? "1" : "0";
    };
    const schedule = () => {
      if (frame === null) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    list.addEventListener("scroll", schedule, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(list);
    return () => {
      list.removeEventListener("scroll", schedule);
      observer?.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [tabsKey]);

  // 選択中が変わったら、そのタブをタブ列の真ん中へ寄せる(最初の表示では動かさない)。
  useEffect(() => {
    if (previousActiveIdRef.current === activeId) {
      return;
    }
    previousActiveIdRef.current = activeId;
    const list = listRef.current;
    const tab = list?.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex];
    if (!list || !tab || typeof list.scrollBy !== "function") {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    // 画面上のずれをそのまま足すので、右から左へ並ぶ言語でも向きを考えなくてよい
    const delta =
      tabRect.left + tabRect.width / 2 - (listRect.left + listRect.width / 2);
    list.scrollBy({
      left: delta,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeId, activeIndex]);

  // 矢印キーで隣のタブへ(WAI-ARIA のタブの操作)。右から左へ並ぶ言語では左右を入れ替える。
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const forward = isRtl(list) ? "ArrowLeft" : "ArrowRight";
    const backward = isRtl(list) ? "ArrowRight" : "ArrowLeft";
    let nextIndex: number;
    if (event.key === forward) {
      nextIndex = activeIndex + 1;
    } else if (event.key === backward) {
      nextIndex = activeIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) {
      return;
    }
    onSelect(next.id);
    list.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    // -mx-4: 帯の左右の余白(px-4)を打ち消して、タブ列を画面の端までスクロールできるようにする。
    // 先頭のタブの文字は、px-1 とタブの px-3 で本文と同じ 16px の位置にそろう
    <div className="relative -mx-4">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className="relative flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className={cn(
                // タッチターゲットを確保する(Mobile-first ルールの 44x44px)
                "flex min-h-[44px] shrink-0 items-center whitespace-nowrap px-3 text-sm font-bold transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-400",
                isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {/* 下線の位置と幅はここを測る(アイコン込みの文字の幅) */}
              <span data-tab-label className="flex items-center gap-1.5">
                {tab.icon}
                {/* 長い名前でタブ列が横に伸び切らないように切り詰める */}
                <span className="max-w-[10rem] truncate">{tab.label}</span>
              </span>
            </button>
          );
        })}
        {/* 選択中の下線。位置と幅は上の effect が直接書き込む */}
        <span
          ref={indicatorRef}
          aria-hidden="true"
          data-testid="catalog-tab-indicator"
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-gradient-to-r from-pink-500 to-orange-400"
          style={{ opacity: 0, width: 0 }}
        />
      </div>
      {/* 続きがある側の端のぼかし。表示は上の effect が切り替える */}
      <span
        ref={startFadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-0 w-6 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 rtl:bg-gradient-to-l"
        style={{ opacity: 0 }}
      />
      <span
        ref={endFadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 rtl:bg-gradient-to-r"
        style={{ opacity: 0 }}
      />
    </div>
  );
}

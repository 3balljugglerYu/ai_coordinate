"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Wand2 } from "lucide-react";
import { stripLocalePrefix } from "@/i18n/config";
import { setLastGenerationModePath } from "@/features/generation/lib/generation-mode-preference";
import { cn } from "@/lib/utils";

/**
 * /coordinate と /style を相互に行き来するためのアニメーション付き
 * セグメントタブ。ボトムナビ/サイドバーに無い style 画面への導線を兼ねる。
 *
 * (app)/layout.tsx に配置されており、/coordinate ⇄ /style の遷移中も
 * インスタンスが保持される。そのため usePathname の更新に合わせて
 * ピル(アクティブ背景)が CSS トランジションで滑らかにスライドし、
 * 遷移完了を待たずに即座に切り替わって見える。ページ本文の読み込みは
 * (app)/loading.tsx のスケルトンがタブの下で受け持つ。
 *
 * ラベルは既存の翻訳キー (nav.coordinate / style.pageTitle) を再利用し、
 * 新規キーを増やさない。
 */
const TABS = [
  { path: "/coordinate", icon: Sparkles },
  { path: "/style", icon: Wand2 },
] as const;

export function GenerationModeTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const navT = useTranslations("nav");
  const styleT = useTranslations("style");

  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  const activeIndex = TABS.findIndex((tab) => tab.path === normalizedPathname);

  // 両ルートを先読みして遷移を体感ゼロに近づける。
  useEffect(() => {
    if (activeIndex === -1) return;
    TABS.forEach((tab) => router.prefetch(tab.path));
  }, [router, activeIndex]);

  // 滞在中のモードを「直近に使った生成モード」として記憶する。
  // ボトムナビ/サイドバーの「コーディネート」入口がこれを読み、前回モードへ復帰する。
  useEffect(() => {
    if (activeIndex === -1) return;
    setLastGenerationModePath(TABS[activeIndex].path);
  }, [activeIndex]);

  // coordinate / style 以外のルートでは表示しない。
  if (activeIndex === -1) return null;

  const labels = [navT("coordinate"), styleT("pageTitle")];

  return (
    <div className="border-b border-pink-100/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div
          role="tablist"
          aria-label={labels.join(" / ")}
          className="relative inline-flex w-full max-w-md items-stretch overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)] sm:w-auto"
        >
          {/* スライドするピル(アクティブ背景) */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-1 left-1 z-0 rounded-full",
              "bg-gradient-to-r from-pink-500 to-orange-400",
              "shadow-[0_4px_14px_rgba(236,72,153,0.35)]",
              "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              "motion-reduce:transition-none"
            )}
            style={{
              // 幅は「枠内の 1/N から左右の余白 0.25rem 分を引いた値」。
              // translateX の % は要素自身の幅基準なので、100% 移動すると
              // ちょうどピル 1 個分だけ動き、両端の余白が左右対称になる。
              width: `calc(${100 / TABS.length}% - 0.25rem)`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />

          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeIndex === index;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                prefetch
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold",
                  "transition-colors duration-300 sm:flex-none sm:min-w-[148px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
                  isActive ? "text-white" : "text-gray-500 hover:text-pink-600"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
                    isActive ? "scale-110 -rotate-6" : "scale-100 rotate-0"
                  )}
                />
                <span className="truncate">{labels[index]}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

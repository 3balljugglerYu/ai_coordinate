"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Wand2, PenLine } from "lucide-react";
import { stripLocalePrefix } from "@/i18n/config";
import { setLastGenerationModePath } from "@/features/generation/lib/generation-mode-preference";
import { cn } from "@/lib/utils";

/**
 * /coordinate・/style・/free を相互に行き来するためのアニメーション付き
 * セグメントタブ。ボトムナビ/サイドバーに無い style / free 画面への導線を兼ねる。
 *
 * (app)/layout.tsx に配置されており、モード間の遷移中も
 * インスタンスが保持される。そのため usePathname の更新に合わせて
 * ピル(アクティブ背景)が CSS トランジションで滑らかにスライドし、
 * 遷移完了を待たずに即座に切り替わって見える。ページ本文の読み込みは
 * (app)/loading.tsx のスケルトンがタブの下で受け持つ。
 *
 * ラベルは既存キー (nav.coordinate / style.pageTitle) と free.tabLabel を使う。
 */
const TABS = [
  { path: "/coordinate", icon: Sparkles },
  { path: "/style", icon: Wand2 },
  { path: "/free", icon: PenLine },
] as const;

export function GenerationModeTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const navT = useTranslations("nav");
  const styleT = useTranslations("style");
  const freeT = useTranslations("free");

  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  // 現在の pathname からロケールプレフィックス(例: /ja)を取り出し、遷移先 URL に
  // 付与してロケールを維持する(これらのルートは現状プレフィックス無しだが、
  // 将来 locale 付きになっても崩れないようにする)。
  const localePrefix = pathname
    ? pathname.slice(0, pathname.length - normalizedPathname.length)
    : "";
  const activeIndex = TABS.findIndex((tab) => tab.path === normalizedPathname);

  // 両ルートを先読みして遷移を体感ゼロに近づける。
  useEffect(() => {
    if (activeIndex === -1) return;
    TABS.forEach((tab) => router.prefetch(`${localePrefix}${tab.path}`));
  }, [router, activeIndex, localePrefix]);

  // 滞在中のモードを「直近に使った生成モード」として記憶する。
  // ボトムナビ/サイドバーの「コーディネート」入口がこれを読み、前回モードへ復帰する。
  useEffect(() => {
    if (activeIndex === -1) return;
    setLastGenerationModePath(TABS[activeIndex].path);
  }, [activeIndex]);

  // coordinate / style / free 以外のルートでは表示しない。
  if (activeIndex === -1) return null;

  const labels = [navT("coordinate"), styleT("pageTitle"), freeT("tabLabel")];

  return (
    <div className="border-b border-pink-100/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3">
        {/* 3タブをスマホ幅に収めるため、アクティブタブだけラベル込みで広げ、
            非アクティブはアイコンのみに縮める(ラベルは sr-only で読み上げ対象に残す)。
            可変幅のためスライドピルは使わず、アクティブタブに直接グラデ背景を当てる。 */}
        <div
          role="tablist"
          aria-label={labels.join(" / ")}
          className="inline-flex w-auto max-w-full items-stretch gap-1 overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)]"
        >
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeIndex === index;
            return (
              <Link
                key={tab.path}
                href={`${localePrefix}${tab.path}`}
                prefetch
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                aria-label={labels[index]}
                title={labels[index]}
                className={cn(
                  "relative flex items-center justify-center rounded-full py-2 text-sm font-semibold whitespace-nowrap",
                  "transition-colors duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
                  isActive
                    ? "flex-1 gap-1.5 bg-gradient-to-r from-pink-500 to-orange-400 px-4 text-white shadow-[0_4px_14px_rgba(236,72,153,0.35)] sm:flex-none sm:min-w-[112px]"
                    : "shrink-0 gap-1 px-3 text-gray-500 hover:text-pink-600"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
                    isActive ? "scale-110 -rotate-6" : "scale-100 rotate-0"
                  )}
                />
                {/* アクティブはラベル表示、非アクティブは読み上げ用に sr-only で保持 */}
                <span className={isActive ? "truncate" : "sr-only"}>
                  {labels[index]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

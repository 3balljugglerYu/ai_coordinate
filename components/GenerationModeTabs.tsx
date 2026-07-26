"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
 * ラベルは coordinate.tabLabel / style.pageTitle / free.tabLabel を使う。
 * coordinate.tabLabel はタブ専用(ボトムナビ/サイドバーの nav.coordinate=「コーディネート」
 * とは別キー)にして、タブだけ英語ブランド名「Coordinate」にできるようにしている。
 */
const TABS = [
  { path: "/coordinate", icon: Sparkles },
  { path: "/style", icon: Wand2 },
  { path: "/free", icon: PenLine },
] as const;

export function GenerationModeTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const coordinateT = useTranslations("coordinate");
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

  // スライドするピル(アクティブ背景)。タブが可変幅(アクティブ=ラベル込み /
  // 非アクティブ=アイコンのみ)のため、アクティブタブの位置・幅を実測してピルを
  // その位置へ transition で移動させる。等幅前提の translateX 方式では
  // 可変幅に対応できないため測定方式にしている。
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // 初回描画ではスライドさせず(左端0からの不自然な移動を防ぐ)、
  // 2回目以降のアクティブ変更でのみ transition を効かせる。
  const [pillReady, setPillReady] = useState(false);

  // 両ルートを先読みして遷移を体感ゼロに近づける。
  useEffect(() => {
    if (activeIndex === -1) return;
    TABS.forEach((tab) => router.prefetch(`${localePrefix}${tab.path}`));
  }, [router, activeIndex, localePrefix]);

  // アクティブタブの実測位置へピルを移動する。activeIndex / ラベル変更(言語切替)後の
  // レイアウト確定後に測定するため useLayoutEffect を使う。
  useLayoutEffect(() => {
    if (activeIndex === -1) return;
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    const measure = () => {
      const node = tabRefs.current[activeIndex];
      if (!node) return;
      setPill({ left: node.offsetLeft, width: node.offsetWidth });
    };
    measure();
    // 初回測定の次フレームで transition を有効化(初回はスライドさせない)。
    const raf = requestAnimationFrame(() => setPillReady(true));
    // コンテナ幅変化(回転・リサイズ)にも追従する。
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [activeIndex, localePrefix, freeT, coordinateT, styleT]);

  // 滞在中のモードを「直近に使った生成モード」として記憶する。
  // ボトムナビ/サイドバーの「コーディネート」入口がこれを読み、前回モードへ復帰する。
  useEffect(() => {
    if (activeIndex === -1) return;
    setLastGenerationModePath(TABS[activeIndex].path);
  }, [activeIndex]);

  // coordinate / style / free 以外のルートでは表示しない。
  if (activeIndex === -1) return null;

  const labels = [
    coordinateT("tabLabel"),
    styleT("pageTitle"),
    freeT("tabLabel"),
  ];

  return (
    <div className="border-b border-pink-100/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3">
        {/* 3タブをスマホ幅に収めるため、アクティブタブだけラベル込みで広げ、
            非アクティブはアイコンのみに縮める(ラベルは sr-only で読み上げ対象に残す)。
            グラデ背景は実測位置へスライドするピルで表現する(従来のスライド演出を維持)。 */}
        <div
          ref={listRef}
          role="tablist"
          aria-label={labels.join(" / ")}
          className="relative inline-flex w-auto max-w-full items-stretch gap-1 overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)]"
        >
          {/* スライドするピル(アクティブ背景)。アクティブタブの実測位置・幅へ移動する。 */}
          {pill ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-1 z-0 rounded-full",
                "bg-gradient-to-r from-pink-500 to-orange-400",
                "shadow-[0_4px_14px_rgba(236,72,153,0.35)]",
                pillReady
                  ? "transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
                  : "",
              )}
              style={{ left: pill.left, width: pill.width }}
            />
          ) : null}

          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeIndex === index;
            return (
              <Link
                key={tab.path}
                href={`${localePrefix}${tab.path}`}
                prefetch
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                aria-label={labels[index]}
                title={labels[index]}
                className={cn(
                  "relative z-10 flex items-center justify-center rounded-full py-2 text-sm font-semibold whitespace-nowrap",
                  // 幅(ラベルの出し入れ)と文字色を同じ duration で滑らかに変化させ、
                  // ピルのスライドと歩調を合わせる。
                  "transition-[color,padding] duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
                  isActive
                    ? "gap-1.5 px-4 text-white sm:min-w-[112px]"
                    : "gap-1 px-3 text-gray-500 hover:text-pink-600"
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

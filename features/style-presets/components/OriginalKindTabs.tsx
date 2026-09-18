"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { localizePublicPath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * 「Persta.AI ORIGINAL ⇄ User ORIGINAL」の2セグメントトグル。
 *
 * `/styles`（運営のワンタップスタイル）と `/user-styles`（ユーザーの原作）を
 * 行き来する。**別ルートを結ぶリンク**であって、クエリパラメータの切替ではない
 * ── どちらのページも静的プリレンダで JSON-LD を初期 HTML に載せる設計なので、
 * `searchParams` を読むとその前提が崩れる（計画書 ADR-001）。
 * `GenerationModeTabs`（/style・/free・/coordinate）と同じ考え方。
 *
 * ⭐ **`GenerationModeTabs` を書き換えて兼用しないこと。** あちらは生成モードの
 * 3タブで、役割も置き場所も違う。
 *
 * ## ピルの動かし方
 *
 * あちらは可変幅（アクティブだけラベルを出す）なので実測してピルを動かしているが、
 * ここは2つとも常にラベルを出す等幅なので、**グリッド2列 + translateX で足りる**。
 * 実測・ResizeObserver を持ち込まない。
 *
 * ## ラベル
 *
 * フィードの引用元カードと同じ語彙（`posts.feedQuoteStyleTitle` /
 * `posts.feedQuoteDerivedTitle`）。**全ロケール同一**にしてあるので、
 * 「棚の名前」と「カードの名前」が食い違わない。
 */
export function OriginalKindTabs({
  active,
  locale,
}: {
  active: "official" | "user";
  locale: Locale;
}) {
  const t = useTranslations("userStyles");

  const tabs = [
    { key: "official" as const, href: "/styles", label: t("tabOfficial") },
    { key: "user" as const, href: "/user-styles", label: t("tabUser") },
  ];
  const activeIndex = tabs.findIndex((tab) => tab.key === active);

  return (
    <div
      role="tablist"
      aria-label={`${tabs[0].label} / ${tabs[1].label}`}
      className="relative grid w-full max-w-md grid-cols-2 gap-1 overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)]"
    >
      {/* アクティブ背景。2列等幅なので幅は50%固定、位置だけ動かす。 */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 z-0 w-[calc(50%-0.25rem)] rounded-full",
          "bg-gradient-to-r from-pink-500 to-orange-400",
          "shadow-[0_4px_14px_rgba(236,72,153,0.35)]",
          "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
        )}
        style={{
          transform: activeIndex === 1 ? "translateX(calc(100% + 0.25rem))" : "none",
        }}
      />
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={localizePublicPath(tab.href, locale)}
            prefetch
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // タッチターゲットを確保する(Mobile-first ルールの 44x44px)。
              // /styles の既存チップは py-1.5 で足りていないので、写さずに広げている。
              "relative z-10 flex min-h-[44px] items-center justify-center rounded-full px-3 text-center text-xs font-bold leading-tight transition-colors duration-300 sm:text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
              isActive ? "text-white" : "text-gray-500 hover:text-pink-600"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

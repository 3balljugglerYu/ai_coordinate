"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PenLine, Users, Wand2 } from "lucide-react";
import { stripLocalePrefix } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { fitHeadingFontSize } from "@/features/style-presets/lib/fit-heading-font-size";

/**
 * カタログのタブ（ペルスタのカタログ / みんなのカタログ / カタログをつくる）。
 * docs/planning/catalog-three-tabs-implementation-plan.md
 *
 * ⭐ **必ず layout に置くこと（ページの中に置いてはいけない）。**
 * 今は `app/[locale]/layout.tsx` の `TopTabsSlot` から出す。3つの画面は
 * `/styles`・`/user-styles` が `(styles-catalog)`、`/free` が `(app)` と枠が分かれて
 * いるので、共通の親に置かないと枠をまたぐたびに作り直される。layout に置けば
 * インスタンスが保持され、
 *
 *  - ピルが**滑らかにスライド**する（ページ内に置くと remount されて瞬間移動する）
 *  - 遷移中もタブが消えず、差し替わるのは下の本文だけになる
 *
 * 最初この作法を外してページ内に置いたところ、「UX として最悪」という指摘を受けた。
 *
 * ⭐ 出すかどうか（段階公開中は運営だけ）は `TopTabsSlot` が決める。ここは
 * 「今どの画面か」だけを見る。
 *
 * ⭐ **`GenerationModeTabs` を書き換えて兼用しないこと。** あちらは一般の利用者にも
 * 出ている生成モードのタブで、一般公開の日まで見た目を変えない約束がある。
 * 作り（可変幅・ピルの実測）だけを同じにしている。
 *
 * ## 見出しとタブの名前（2026-09-29 ユーザー指示）
 *
 * - ページの見出し（h1）は、選んでいるタブの名前を各言語で出す
 *   （ペルスタのカタログ / みんなのカタログ / カタログをつくる）
 * - タブの中は英語の名前だけ（Persta ORIGINAL / User ORIGINAL / CREATE）で、**全ロケール同一**。
 *   「Persta ORIGINAL」はタブに入れるために短くした。フィードの引用元カード
 *   （`posts.feedQuoteStyleTitle`。一般の利用者に見える）は「Persta.AI ORIGINAL」のまま
 * - 見出しは、どの言語でも1行に収める。入りきらない言語だけ文字を小さくし、
 *   3つの見出しを同じ大きさにそろえる（`fitHeadingFontSize`）
 * - タブの列は中央ぞろえにせず、見出しの左端にそろえる（見出しと同じ入れ物に入れる）
 *
 * 名前は「誰が届けるか」だけで分け、よし悪しの差をつけない（計画書 ADR-008）。
 *
 * ## 幅
 *
 * 3つ並べるとスマホでは名前が入りきらないので、選んでいるタブだけ名前を全部出し、
 * ほかはアイコンと名前の冒頭4文字（「Pers…」など）にする。名前は読み上げ用に
 * aria-label と sr-only で全部残す（冒頭4文字は読み上げない）。
 * 幅が変わるので、選んでいるタブの位置と幅を測ってピルを動かす
 * （`GenerationModeTabs` と同じ）。
 */
const TABS = [
  {
    path: "/styles",
    // ページの見出し(各言語)
    titleKey: "tabOfficialTitle",
    // タブの中の名前(英語。全ロケール同一)
    labelKey: "tabOfficial",
    icon: Wand2,
  },
  {
    path: "/user-styles",
    titleKey: "tabUserTitle",
    labelKey: "tabUser",
    icon: Users,
  },
  {
    path: "/free",
    titleKey: "tabCreateTitle",
    labelKey: "tabCreate",
    icon: PenLine,
  },
] as const;

/** 選んでいないタブに出す、名前の文字数 */
const SHORT_LABEL_LENGTH = 4;
/** 見出しの大きさ(text-3xl)と、縮めるときの下限 */
const HEADING_BASE_PX = 30;
const HEADING_MIN_PX = 20;

function shortLabel(label: string): string {
  return `${label.slice(0, SHORT_LABEL_LENGTH).trimEnd()}…`;
}

export function OriginalKindTabs() {
  const t = useTranslations("userStyles");
  const pathname = usePathname();

  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  // 現在の pathname からロケールプレフィックス(例: /ja)を取り出し、遷移先 URL へ
  // 引き継ぐ。落とすと押した瞬間に言語が既定へ戻る。
  const localePrefix = pathname
    ? pathname.slice(0, pathname.length - normalizedPathname.length)
    : "";
  const activeIndex = TABS.findIndex((tab) => tab.path === normalizedPathname);

  // スライドするピル(選んでいるタブの背景)。タブが可変幅なので、選んでいるタブの
  // 位置・幅を実測して transition で移動させる。
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // 初回描画ではスライドさせず(左端0からの不自然な移動を防ぐ)、
  // 2回目以降の切り替えでのみ transition を効かせる。
  const [pillReady, setPillReady] = useState(false);

  // 切り替え・言語切替(ラベルの幅が変わる)のあと、レイアウトが決まってから測る。
  useLayoutEffect(() => {
    if (activeIndex === -1) return;
    const measure = () => {
      const node = tabRefs.current[activeIndex];
      if (!node) return;
      setPill({ left: node.offsetLeft, width: node.offsetWidth });
    };
    measure();
    const raf = requestAnimationFrame(() => setPillReady(true));
    // 画面の回転・リサイズにも追従する。
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [activeIndex, localePrefix, t]);

  // 見出しを1行に収める大きさ。3つの見出しを見出しと同じ書き方(30px)で測り、一番長いものが
  // 入らなければ3つとも同じ大きさに縮める(タブを移っても大きさが変わらない)。
  const titles = TABS.map((tab) => t(tab.titleKey));
  const titlesKey = titles.join("\n");
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [headingFontPx, setHeadingFontPx] = useState<number | null>(null);
  const isCatalogPage = activeIndex !== -1;

  useLayoutEffect(() => {
    if (!isCatalogPage) return;
    const heading = headingRef.current;
    if (!heading) return;
    const fit = () => {
      setHeadingFontPx(
        fitHeadingFontSize({
          basePx: HEADING_BASE_PX,
          minPx: HEADING_MIN_PX,
          availablePx: heading.clientWidth,
          titleWidthsPx: measureRefs.current.map((node) => node?.offsetWidth ?? 0),
        })
      );
    };
    fit();
    // 画面の回転・リサイズと、Web フォントの読み込み(見出しの幅が変わる)に追従する。
    const ro = new ResizeObserver(fit);
    ro.observe(heading);
    for (const node of measureRefs.current) {
      if (node) ro.observe(node);
    }
    return () => ro.disconnect();
  }, [isCatalogPage, titlesKey]);

  // /styles/[slug] など対象外のルートでは出さない。
  if (!isCatalogPage) {
    return null;
  }

  const labels = TABS.map((tab) => t(tab.labelKey));

  return (
    // 下の区切り線は付けない(見出し・チップの帯と同じ白の面で続けて見せる)
    <div className="bg-white/80 backdrop-blur-sm">
      {/*
        見出しとタブは同じ入れ物に入れ、タブの列を見出しの左端にそろえる。
        見出しは選んでいるタブの名前。ホームの "Persta | ペルスタ"(HomeHeading)と同じ大きさ。
        タブの下の各ページの見出しは出さず、これをページの h1 にする
        (/free では FreePageHeader が自分の h1 を出さない)。
      */}
      <div className="relative mx-auto max-w-6xl px-4 pt-3 pb-3">
        {/*
          1行に収める(折り返さない)。縮めても行の高さ(leading-9 = 36px)は変えないので、
          タブが上下に動かない。測り終わる前(サーバーの HTML)に長い見出しがはみ出しても、
          ページが横に揺れないよう横だけ切る(上の記号・声調記号は切らない)。
        */}
        <h1
          ref={headingRef}
          className="text-3xl leading-9 font-bold whitespace-nowrap overflow-x-clip"
          style={headingFontPx ? { fontSize: `${headingFontPx}px` } : undefined}
        >
          {titles[activeIndex]}
        </h1>
        {/* 見出しの幅を測る用(見えない・読み上げない)。見出しと同じ書き方にする */}
        <div
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 overflow-hidden"
        >
          {titles.map((title, index) => (
            <span
              key={TABS[index].path}
              data-heading-measure
              ref={(node) => {
                measureRefs.current[index] = node;
              }}
              className="absolute text-3xl font-bold whitespace-nowrap"
            >
              {title}
            </span>
          ))}
        </div>
        <div
          ref={listRef}
          role="tablist"
          aria-label={labels.join(" / ")}
          className="relative mt-3 flex w-fit max-w-full items-stretch gap-1 overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)]"
        >
          {pill ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-1 z-0 rounded-full",
                "bg-gradient-to-r from-pink-500 to-orange-400",
                "shadow-[0_4px_14px_rgba(236,72,153,0.35)]",
                pillReady
                  ? "transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
                  : ""
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
                  // タッチターゲットを確保する(Mobile-first ルールの 44x44px)。
                  "relative z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full py-1.5 whitespace-nowrap",
                  // 幅(名前の出し入れ)と文字色を同じ duration で変え、ピルのスライドと歩調を合わせる。
                  "transition-[color,padding] duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
                  // 選んでいるタブは縮めない(名前を全部見せる)。選んでいないタブは幅が足りなければ
                  // 少し縮み、入りきらない分はタブの中で隠す(隣のタブに文字を重ねない)。
                  isActive
                    ? "shrink-0 gap-2 px-4 text-white"
                    : "gap-1.5 overflow-hidden px-3 text-gray-500 hover:text-pink-600"
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
                    isActive ? "scale-110 -rotate-6" : "scale-100 rotate-0"
                  )}
                />
                {isActive ? (
                  <span className="text-sm font-bold">{labels[index]}</span>
                ) : (
                  <>
                    {/*
                      選んでいないタブは冒頭4文字。読み上げは名前全部(sr-only)に任せる。
                      幅 360px 未満の狭いスマホでは入りきらずアイコンが欠けるので、アイコンだけにする。
                    */}
                    <span aria-hidden className="hidden text-sm font-semibold min-[360px]:inline">
                      {shortLabel(labels[index])}
                    </span>
                    <span className="sr-only">{labels[index]}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

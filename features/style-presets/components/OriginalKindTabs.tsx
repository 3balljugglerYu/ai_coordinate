"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { stripLocalePrefix } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * 「Persta.AI ORIGINAL ⇄ User ORIGINAL」の2セグメントトグル。
 *
 * ⭐ **必ず layout に置くこと（ページの中に置いてはいけない）。**
 * `app/(styles-catalog)/layout.tsx` に置くことで `/styles` ⇄ `/user-styles` の
 * 遷移中もこのコンポーネントのインスタンスが保持され、
 *
 *  - ピルが**滑らかにスライド**する（ページ内に置くと remount されて瞬間移動する）
 *  - 遷移中もタブが消えず、差し替わるのは下の本文だけになる
 *    （`(styles-catalog)/loading.tsx` のスケルトンがタブの下に出る）
 *
 * `GenerationModeTabs`（/style・/free・/coordinate）が `(app)/layout.tsx` で
 * 同じことをしている。最初この作法を外してページ内に置いたところ、
 * 「UX として最悪」という指摘を受けた。
 *
 * ⭐ **`GenerationModeTabs` を書き換えて兼用しないこと。** あちらは生成モードの
 * 3タブで、役割も置き場所も違う。
 *
 * ## ピルの動かし方
 *
 * あちらは可変幅（アクティブだけラベルを出す）なので実測してピルを動かしているが、
 * ここは2つとも常にラベルを出す等幅なので、**グリッド2列 + translateX で足りる**。
 *
 * ## ラベル
 *
 * フィードの引用元カードと同じ語彙（`posts.feedQuoteStyleTitle` /
 * `posts.feedQuoteDerivedTitle`）。**全ロケール同一**にしてあるので、
 * 「棚の名前」と「カードの名前」が食い違わない。
 */
const TABS = [
  { path: "/styles", labelKey: "tabOfficial" },
  { path: "/user-styles", labelKey: "tabUser" },
] as const;

export function OriginalKindTabs({
  /**
   * User ORIGINAL が一般公開されているか。
   *
   * ⭐ 公開前は `/styles` 側にトグルを出さない（存在を知らせないため）。
   * 判定に `isUserStylesAvailable`（運営を含む方）を使うと閲覧者が必要になり、
   * `/styles` の静的シェルが崩れるので、**純粋なフラグだけ**を受け取る。
   * 運営は公開前も `/user-styles` を直接開いて確認する。
   */
  publiclyEnabled,
}: {
  publiclyEnabled: boolean;
}) {
  const t = useTranslations("userStyles");
  const pathname = usePathname();

  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;
  // 現在の pathname からロケールプレフィックス(例: /ja)を取り出し、遷移先 URL へ
  // 引き継ぐ。落とすと押した瞬間に言語が既定へ戻る。
  const localePrefix = pathname
    ? pathname.slice(0, pathname.length - normalizedPathname.length)
    : "";
  const activeIndex = TABS.findIndex((tab) => tab.path === normalizedPathname);

  // /styles/[slug] など対象外のルートでは出さない。
  if (activeIndex === -1) {
    return null;
  }
  // 公開前の /styles には出さない（/user-styles 側は到達できる時点で権限がある）。
  if (!publiclyEnabled && normalizedPathname === "/styles") {
    return null;
  }

  const labels = TABS.map((tab) => t(tab.labelKey));

  return (
    <div className="border-b border-pink-100/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl justify-center px-4 py-3">
        <div
          role="tablist"
          aria-label={labels.join(" / ")}
          className="relative grid w-full max-w-md grid-cols-2 gap-1 overflow-hidden rounded-full border border-pink-100/80 bg-white/70 p-1 shadow-[0_2px_10px_rgba(236,72,153,0.08)]"
        >
          {/* アクティブ背景。2列等幅なので幅は50%固定、位置だけ動かす。
              layout に置いてインスタンスが保たれるので、この transition が実際に効く。 */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-1 left-1 z-0 w-[calc(50%-0.25rem)] rounded-full",
              "bg-gradient-to-r from-pink-500 to-orange-400",
              "shadow-[0_4px_14px_rgba(236,72,153,0.35)]",
              "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
            )}
            style={{
              transform:
                activeIndex === 1 ? "translateX(calc(100% + 0.25rem))" : "none",
            }}
          />
          {TABS.map((tab, index) => {
            const isActive = activeIndex === index;
            return (
              <Link
                key={tab.path}
                href={`${localePrefix}${tab.path}`}
                prefetch
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // タッチターゲットを確保する(Mobile-first ルールの 44x44px)。
                  "relative z-10 flex min-h-[44px] items-center justify-center rounded-full px-3 text-center text-xs font-bold leading-tight transition-colors duration-300 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1",
                  isActive ? "text-white" : "text-gray-500 hover:text-pink-600"
                )}
              >
                {labels[index]}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

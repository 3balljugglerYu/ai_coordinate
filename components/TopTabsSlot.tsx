"use client";

import { usePathname } from "next/navigation";
import { stripLocalePrefix } from "@/i18n/config";
import { GenerationModeTabs } from "@/components/GenerationModeTabs";
import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import { GENERATION_MODE_PATHS } from "@/features/generation/lib/generation-mode-preference";

/** カタログの3つのタブの画面(Perstaのカタログ・みんなのカタログ・カタログをつくる)。 */
const CATALOG_TAB_PATHS = new Set(["/styles", "/user-styles", "/free"]);

/**
 * 画面上部のタブの入れ物。`app/[locale]/layout.tsx` に置く。
 * docs/planning/catalog-three-tabs-implementation-plan.md ADR-001
 *
 * ⭐ **カタログ刷新（公開前は運営だけ）の人にだけ、ここからタブを出す。**
 * 一般の利用者には何も描かない（空の要素も出さない）。一般の利用者の生成モードの
 * タブは、一般公開の日まで今の置き場所（`(app)/layout.tsx` の
 * `GeneralUserGenerationModeTabs`）から出す。見た目もコードの通り道も変えないため。
 *
 * ⭐ **ここに置く理由:** カタログの3つの画面は、`/styles`・`/user-styles` が
 * `(styles-catalog)`、`/free` が `(app)` と枠が分かれている。枠ごとの layout に
 * タブを置くと、枠をまたぐたびに作り直され、ピルが滑らずに一度消える。3つに共通の
 * 親の layout に置けば、どの2つの間を移っても同じインスタンスのまま残る。
 *
 * ⭐ サーバーで認証を引かないこと。この入れ物の上の layout がリクエスト依存になり、
 * `/styles` の静的シェルと初期 HTML の JSON-LD という前提が崩れる。刷新の判定は
 * `UserStylesAvailabilityProvider`（LocaleShell に置いた context）から取る。
 */
export function TopTabsSlot() {
  const isCatalogRevamp = useStylesCatalogRevamp();
  const pathname = usePathname();
  const normalizedPathname = stripLocalePrefix(pathname ?? "/").pathname;

  /*
    ⭐ /user-styles でも判定を待つ(刷新前のタブは、ここだけ判定を待たずに出していた)。
    一般の利用者が /user-styles を開くと 404 になるが、404 に替わる前の HTML に
    タブが入り、公開前の「カタログをつくる」まで見えてしまう。
    運営は /styles・/free と同じく、判定が届いてからタブが出る(公開前だけ)。
  */
  if (CATALOG_TAB_PATHS.has(normalizedPathname)) {
    return isCatalogRevamp ? <OriginalKindTabs /> : null;
  }

  // One-Tap の画面(/style)は、刷新後も生成モードのタブのまま(計画書 ADR-006)
  if (isCatalogRevamp && normalizedPathname === GENERATION_MODE_PATHS.style) {
    return <GenerationModeTabs />;
  }

  return null;
}

"use client";

import { GenerationModeTabs } from "@/components/GenerationModeTabs";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * 一般の利用者用の生成モードのタブ（`(app)/layout.tsx` に置く）。
 *
 * 一般の利用者には、今までどおりここから `GenerationModeTabs` を出す（一般公開の日まで
 * 見た目もコードの通り道も変えない）。カタログ刷新（公開前は運営だけ）の人には、
 * `TopTabsSlot`（`app/[locale]/layout.tsx`）がタブを出すので、ここは何も出さない
 * （二重にしない）。
 *
 * 一般公開のあとは全員が刷新後になるので、この部品ごと消す
 * （docs/planning/catalog-three-tabs-implementation-plan.md Phase 6）。
 */
export function GeneralUserGenerationModeTabs() {
  const isCatalogRevamp = useStylesCatalogRevamp();
  if (isCatalogRevamp) {
    return null;
  }
  return <GenerationModeTabs />;
}

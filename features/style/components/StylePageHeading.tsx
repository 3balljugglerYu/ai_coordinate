"use client";

import { useTranslations } from "next-intl";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * /style の見出し(h1)。
 *
 * カタログ刷新後(公開前は運営だけ)は One-Tap Style を Persta ORIGINAL と呼ぶ
 * (2026-10-01 ユーザー決定。上のタブ GenerationModeTabs と同じ名前)。
 * 運営は後から刷新に切り替わるので、サーバーではなくここで出し分ける。
 */
export function StylePageHeading() {
  const t = useTranslations("style");
  const isCatalogRevamp = useStylesCatalogRevamp();

  return (
    <h1 className="text-3xl font-bold text-gray-900">
      {t(isCatalogRevamp ? "pageTitleRevamp" : "pageTitle")}
    </h1>
  );
}

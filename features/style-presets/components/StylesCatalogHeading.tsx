"use client";

import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * `/styles` の見出しと説明。カタログ刷新（段階公開中は運営のみ）では見出しを出さず、
 * 説明を新しい文言にする。
 *
 * ⭐ ページは静的シェル + 初期 HTML の JSON-LD という前提で作られているので、
 * 運営かどうかをページ本体で判定できない（`app/(styles-catalog)/styles/page.tsx` 冒頭）。
 * 両方の文言をサーバーから受け取り、判定はクライアントの context に任せる。
 * 初期 HTML（クローラーが見るもの）は刷新前の文言になる。
 */
export function StylesCatalogHeading({
  heading,
  intro,
  originalIntro,
}: {
  heading: string;
  intro: string;
  originalIntro: string;
}) {
  const isCatalogRevamp = useStylesCatalogRevamp();

  if (isCatalogRevamp) {
    /*
      刷新後は見出しを出さず説明だけにする。ページの h1 は上の
      「Catalog」(OriginalKindTabs)で、タブの「Persta.AI ORIGINAL」が見出しの役を兼ねる。
    */
    return (
      <header className="mb-6 md:mb-8">
        <p className="max-w-3xl text-sm text-gray-600 md:text-base">
          {originalIntro}
        </p>
      </header>
    );
  }

  return (
    <header className="mb-6 space-y-2 md:mb-8">
      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
        {heading}
      </h1>
      <p className="max-w-3xl text-sm text-gray-600 md:text-base">{intro}</p>
    </header>
  );
}

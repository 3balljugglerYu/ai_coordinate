"use client";

import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * スタイルカタログ(`/styles`・`/user-styles`)の `<main>` と本文の入れ物。
 * カタログ刷新（段階公開中は運営のみ）では:
 *  - ページ背景を白にし、上部に固定するチップ列の帯(`StylesCatalogChipBar`, bg-white)と
 *    色をそろえる
 *  - 見出しの上余白をなくす。上のタブ(`OriginalKindTabs`)の区切り線を消したので、
 *    タブの余白だけで見出しに続ける
 * 刷新前はこれまでどおり bg-gray-50・上余白 pt-6 / md:pt-8。
 *
 * ページ本体はサーバーコンポーネントのまま、中身は children として受け取る。
 */
export function StylesCatalogMain({
  children,
}: {
  children: React.ReactNode;
}) {
  const isCatalogRevamp = useStylesCatalogRevamp();

  return (
    <main
      className={`min-h-screen ${isCatalogRevamp ? "bg-white" : "bg-gray-50"}`}
    >
      <div
        className={`mx-auto max-w-6xl px-4 pb-12 ${
          isCatalogRevamp ? "pt-0" : "pt-6 md:pt-8"
        }`}
      >
        {children}
      </div>
    </main>
  );
}

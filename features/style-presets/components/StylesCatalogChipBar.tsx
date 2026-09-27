"use client";

import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * スタイルカタログ(`/styles`・`/user-styles`)の絞り込み(チップ列 / タブ)を包む。
 * カタログ刷新（段階公開中は運営のみ）では、中身はタブ(`CatalogTabBar`)になり、
 * スクロールしてタブ列が上端に来たらそこで固定する。
 * 刷新前はただの箱で、チップ列がこれまでどおり一緒に流れる。
 *
 * ⭐ ヘッダーと同じく、上端・左右とも画面にぴったり付けた不透明な帯にする
 * (下の一覧が透けたり、隙間から覗いたりしないように)。
 * lg 未満はヘッダーが固定されずに流れる(`StickyHeader`)ので、画面の上端(top-0)に固定する。
 * lg 以上はヘッダーが固定のままなので、その直下(--app-header-height)に固定する。
 *
 * ⭐ sticky は親要素の中でしか効かない。一覧(グリッド/フィード)と同じ親の
 * 直下に置くこと。一覧を包む `CatalogSwipePanel` も、同じ親の中からこの帯
 * (`data-catalog-tab-bar`)を探して、タブを切り替えたときに一覧の先頭を帯の下へ戻す。
 */
export function StylesCatalogChipBar({
  children,
}: {
  children: React.ReactNode;
}) {
  const isCatalogRevamp = useStylesCatalogRevamp();

  if (!isCatalogRevamp) {
    return <div>{children}</div>;
  }

  return (
    <div
      data-testid="styles-catalog-chip-bar"
      data-catalog-tab-bar
      // -mx-4 px-4: 本文の左右余白(px-4)を打ち消して画面幅いっぱいに広げ、中身の位置は保つ
      // top: lg 未満は画面の上端、lg 以上は固定ヘッダーの直下
      // pt-1 のみ: タブの下線を帯の下端(区切り線の上)にぴったり付けるため、下の余白は付けない
      className="sticky top-0 z-40 -mx-4 mb-4 border-b bg-white px-4 pt-1 shadow-sm lg:top-[var(--app-header-height,64px)]"
    >
      {children}
    </div>
  );
}

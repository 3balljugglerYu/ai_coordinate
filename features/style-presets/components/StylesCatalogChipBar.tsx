"use client";

import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * スタイルカタログ(`/styles`・`/user-styles`)のチップ列を包む。
 * カタログ刷新（段階公開中は運営のみ）では、スクロールしてチップ列が上端に来たら
 * そこで固定する。刷新前はただの箱で、これまでどおり一緒に流れる。
 *
 * ⭐ ヘッダーと同じく、上端・左右とも画面にぴったり付けた不透明な帯にする
 * (下の一覧が透けたり、隙間から覗いたりしないように)。
 * lg 未満はヘッダーが固定されずに流れる(`StickyHeader`)ので、画面の上端(top-0)に固定する。
 * lg 以上はヘッダーが固定のままなので、その直下(--app-header-height)に固定する。
 *
 * ⭐ sticky は親要素の中でしか効かない。一覧(グリッド/フィード)と同じ親の
 * 直下に置くこと。
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
      // -mx-4 px-4: 本文の左右余白(px-4)を打ち消して画面幅いっぱいに広げ、中身の位置は保つ
      // top: lg 未満は画面の上端、lg 以上は固定ヘッダーの直下
      // pt-2 / pb-1: チップ列の下余白(pb-1)と合わせて、スクロールバーが無いとき上下とも 8px
      className="sticky top-0 z-40 -mx-4 mb-4 border-b bg-white px-4 pb-1 pt-2 shadow-sm lg:top-[var(--app-header-height,64px)]"
    >
      {children}
    </div>
  );
}

/**
 * スタイルカタログ（`/styles` / `/styles/[slug]` / `/user-styles`）のローディング。
 *
 * もとは、遷移中にタブ（トグル）ごと差し替わらないように置いた（`loading.tsx` は
 * 置いた階層に Suspense 境界を作る）。タブは `app/[locale]/layout.tsx` の
 * `TopTabsSlot` に移ったので、今はこの有無に関係なくタブは残る。
 * 遷移中の表示を変えないため、ファイルはそのまま残している。
 *
 * ⭐ **軽量に保つこと。** `app/[locale]/loading.tsx` と同じ方針で、
 * ルート単位では重いスケルトンを出さず、実際の骨組みは各ページ内の
 * Suspense fallback（`StylesGallerySkeleton` / `UserStylesFeedSkeleton`）に任せる。
 * ここを一覧向けに作り込むと、同じ配下にある `/styles/[slug]`（詳細ページ）に
 * 一覧の形が出てしまう。
 */
export default function StylesCatalogLoading() {
  return (
    <div
      className="mx-auto min-h-[40vh] max-w-6xl px-4 pb-8 pt-6 md:pt-8"
      aria-hidden
    >
      <div className="h-9 w-40 animate-pulse rounded bg-gray-200/80" />
    </div>
  );
}

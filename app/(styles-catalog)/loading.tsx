/**
 * スタイルカタログ（`/styles` / `/styles/[slug]` / `/user-styles`）のローディング。
 *
 * ⭐ **これが無いと、遷移中にルート階層の `loading.tsx` が効いてトグルごと
 * 差し替わる。** `loading.tsx` は置いた階層に Suspense 境界を作るので、
 * ここに置くことで「トグルは残り、下だけが差し替わる」状態になる。
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

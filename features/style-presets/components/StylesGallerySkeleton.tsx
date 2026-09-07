const SKELETON_CHIP_COUNT = 5;
const SKELETON_CARD_COUNT = 8;

/**
 * `/styles` のギャラリー(チップ列 + カードグリッド)のプレースホルダ。
 *
 * ギャラリー本体は運営プレビュー判定のため認証を引く = 動的なので、
 * `StylesGalleryClient` と同じ骨格でレイアウトシフトを抑える。
 */
export function StylesGallerySkeleton() {
  return (
    <div>
      {/* チップ列 */}
      <div className="-mx-1 flex gap-2 overflow-x-hidden px-1 pb-1">
        {Array.from({ length: SKELETON_CHIP_COUNT }).map((_, index) => (
          <div
            key={index}
            className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-gray-200"
          />
        ))}
      </div>
      {/* チップ列のスクロールインジケーター(本体と同じ高さを確保) */}
      <div className="mx-1 mb-4 mt-1 h-1 rounded-full bg-slate-100" />
      {/* カードグリッド */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
          <div
            key={index}
            className="aspect-[2/3] animate-pulse rounded-lg bg-gray-200"
          />
        ))}
      </div>
    </div>
  );
}

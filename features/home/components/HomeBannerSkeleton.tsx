/**
 * ホームバナー用スケルトン（カルーセル形式）
 *
 * 実カルーセル(Swiper: slidesPerView 1.5, spaceBetween 16)と同じ高さに
 * なるよう、2/3幅のカード + 次スライドの一部を再現する。
 * 高さが実体とずれると差し替え時に下のセクションが動き CLS になる
 * (旧実装の全幅1枚では実体より約40px高く、CLS 0.09 相当のシフトが出ていた)。
 */
export function HomeBannerSkeleton() {
  return (
    <div className="mb-8 overflow-x-hidden">
      <div className="-mx-4 px-4">
        <div className="flex gap-4">
          <div className="aspect-[3/1] w-[calc((100%_-_16px)/1.5)] flex-shrink-0 animate-pulse rounded-lg bg-gray-200" />
          <div className="aspect-[3/1] w-[calc((100%_-_16px)/1.5)] flex-shrink-0 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

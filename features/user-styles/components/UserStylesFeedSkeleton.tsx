/**
 * /user-styles の一覧が届くまでの骨組み。
 *
 * ⭐ **チップ列とカードの高さを、本物と同じだけ確保する。** ここで詰めると
 * 一覧が届いた瞬間に画面が下へ飛ぶ（レイアウトシフト）。
 * 幅もフィードと同じ 600px に揃える。
 */
export function UserStylesFeedSkeleton() {
  return (
    <div aria-hidden="true">
      {/* チップ列（min-h-[52px] + インジケーターの余白）と同じ高さ */}
      <div className="mb-4 flex min-h-[52px] items-center gap-2">
        <div className="h-11 w-20 shrink-0 animate-pulse rounded-full bg-gray-200" />
        <div className="h-11 w-40 shrink-0 animate-pulse rounded-full bg-gray-200" />
      </div>
      <div className="mx-auto flex max-w-[600px] flex-col">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            {/* 作者行 */}
            <div className="flex items-center gap-2 p-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
              <div className="h-3 w-28 animate-pulse rounded bg-gray-200" />
            </div>
            {/* Before / After（掲載対象は必ず2枚持つ） */}
            <div className="grid grid-cols-2 gap-0.5">
              <div className="aspect-square animate-pulse bg-gray-200" />
              <div className="aspect-square animate-pulse bg-gray-200" />
            </div>
            {/* 引用元ブロック（プロンプト作成者 + CTA） */}
            <div className="m-3 h-24 animate-pulse rounded-xl bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

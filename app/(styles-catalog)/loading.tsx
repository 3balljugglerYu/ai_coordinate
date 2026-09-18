/**
 * スタイルカタログ（`/styles` / `/user-styles`）のローディング。
 *
 * ⭐ これがあることで、遷移中も**トグルが残ったまま**下だけが差し替わる
 * （全画面が真っ白にならない）。`(app)/loading.tsx` と同じ役割。
 *
 * 2つのページはグリッドとフィードで形が違うので、ここでは共通の
 * 「見出し + チップ列 + 何かが並ぶ」ぶんの高さだけを確保する。
 */
export default function StylesCatalogLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:pt-8" aria-hidden="true">
        {/* 見出し + 説明 + 注記 */}
        <div className="mb-6 space-y-2 md:mb-8">
          <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-2/3 max-w-3xl animate-pulse rounded bg-gray-200" />
        </div>
        {/* チップ列（本物と同じ高さを確保してレイアウトシフトを防ぐ） */}
        <div className="mb-4 flex min-h-[52px] items-center gap-2">
          <div className="h-11 w-20 shrink-0 animate-pulse rounded-full bg-gray-200" />
          <div className="h-11 w-40 shrink-0 animate-pulse rounded-full bg-gray-200" />
        </div>
        <div className="mx-auto grid max-w-[600px] gap-4">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}

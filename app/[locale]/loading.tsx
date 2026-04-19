/**
 * [locale] セグメント用の軽量ローディング。
 * ルート単位では重いホーム専用 skeleton を出さず、
 * 各 page 内の Suspense fallback に表示責務を寄せる。
 */
export default function LocaleLoading() {
  return (
    <div
      className="mx-auto min-h-[40vh] max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8"
      aria-hidden
    >
      <div className="mb-4">
        <div className="h-9 w-40 animate-pulse rounded bg-gray-200/80" />
      </div>
    </div>
  );
}

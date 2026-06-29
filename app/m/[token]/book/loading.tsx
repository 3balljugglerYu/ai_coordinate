/**
 * 本(スクラップブック)シェアページのローディング UI。
 *
 * /m/[token]/book はサーバーコンポーネントでデータ取得(getCollectionBookByToken)を行うため、
 * 遷移直後の数百ms、親(app/loading.tsx = 通常のアプリシェル)が一瞬見えてしまう
 * (英語ホーム風のチラつき)。ここに没入スケルトンを置くことで、リーダーと同じ全画面の
 * 背景でローディングを覆い、チラつきを防ぐ。ScrapbookReader と同じ bg-slate-50 / 全画面。
 */
export default function BookLoading() {
  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-50">
      {/* 本(縦長 9:16 風)のスケルトン */}
      <div className="relative aspect-[3/4] w-[min(72vw,300px)] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-md">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-stone-100 via-stone-200/70 to-stone-100" />
      </div>
      <div className="flex items-center gap-2 text-stone-400">
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.2s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.1s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300" />
        <span className="ml-2 text-sm font-medium">本を準備中…</span>
      </div>
    </div>
  );
}

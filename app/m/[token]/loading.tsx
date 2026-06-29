/**
 * シェアページ(/m/[token])のローディング UI。
 *
 * /m/[token] はサーバーで getCollectionBookByToken 等を解決し、book 完走は
 * /m/[token]/book へ redirect する。この解決中、loading.tsx が無いと親
 * (app/loading.tsx = 通常アプリシェル)が一瞬見え、英語ホーム風のチラつきが出る。
 * ここに全画面の没入スケルトンを置いて覆う。book/台紙 どちらにも遷移しうるため中立文言。
 */
export default function ShareLoading() {
  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-50">
      <div className="relative aspect-[3/4] w-[min(72vw,300px)] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-md">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-stone-100 via-stone-200/70 to-stone-100" />
      </div>
      <div className="flex items-center gap-2 text-stone-400">
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.2s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.1s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300" />
        <span className="ml-2 text-sm font-medium">読み込み中…</span>
      </div>
    </div>
  );
}

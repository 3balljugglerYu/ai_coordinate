/**
 * 投稿フォームのローディング。
 *
 * これが無いと、遷移が終わるまで**前の画面が出たまま**になる。拡大表示から
 * 投稿を押したときに、拡大表示が閉じて下の一覧が一瞬見えてしまうのはこれが
 * 理由（親の `app/posts/loading.tsx` は投稿詳細用のスケルトンなので、ここに
 * このページの形のものを置く）。
 *
 * 実際のフォーム（`PostModal`）と同じ骨格にして、読み込みが終わったときに
 * 位置が飛ばないようにしている。
 */
export default function NewPostLoading() {
  return (
    <div className="mx-auto w-full max-w-[600px] pb-24">
      {/* 上部バー（✕ / タイトル / 投稿する）*/}
      <div className="bg-background/95 sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-9 shrink-0 animate-pulse rounded-md bg-slate-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="h-9 w-24 shrink-0 animate-pulse rounded-md bg-slate-200" />
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* 説明文 */}
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />

        {/* 画像プレビュー（max-h-[30vh] に合わせる）*/}
        <div className="flex w-full justify-center">
          <div className="h-[30vh] w-[60%] animate-pulse rounded bg-slate-200" />
        </div>

        {/* キャプション */}
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-24 w-full animate-pulse rounded-md bg-slate-200" />
        </div>

        {/* 生成前の画像も表示する */}
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

/**
 * /inspire/[templateId] の Suspense fallback skeleton。
 *
 * 既存 Inspire レイアウト (= 2-col grid: テンプレ画像 + フォーム) と
 * Creator Looks レイアウト (= 1-col: 大画像 + 帰属 + CTA、モックアップ 03 参照) の
 * 両方に共通する「大画像 + 帰属 + CTA ボタン」型の中立スケルトン。
 */
export default function InspirePageLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>

      {/* 大画像 */}
      <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />

      {/* タイトル + by クリエイター + 利用回数 */}
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>

      {/* CTA ボタン領域 */}
      <div className="h-12 w-full animate-pulse rounded-md bg-muted" />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ページが見つかりません | 絵師カタログ | Persta.AI",
  robots: { index: false, follow: false },
};

/**
 * カタログ専用 404 ページ。
 * Next.js のルーティング規約により、`/catalog/**` 配下で `notFound()` が呼ばれた
 * 場合に表示される。サイト全体の汎用 404 は別 PR の管轄。
 */
export default function CatalogNotFound() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-16 text-center">
        <p className="select-none text-6xl" aria-hidden="true">
          📖
        </p>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          ページが見つかりませんでした
        </h1>
        <p className="mt-4 text-slate-600">
          お探しの企画 (本) は終了したか、URL に間違いがある可能性があります。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          他にも素敵な作品が並んでいる本があります。よかったらカタログ一覧から覗いてみてください。
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            カタログ一覧へ戻る
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Persta.AI ホームへ
          </Link>
        </div>
      </div>
    </div>
  );
}

import Image from "next/image";

export interface CatalogPageData {
  id: string;
  imageUrl: string | null;
  alt: string | null;
  displayName: string;
  xAccountUrl: string;
  sourceTweetUrl: string;
}

interface CatalogPageProps {
  page: CatalogPageData;
}

/**
 * 本めくり UI 内の 1 ページ。
 * 画像 + 表示名 + X アカウントへの誘導。
 * react-pageflip 経由でレンダリングされる際は forwardRef 不要 (children として渡される)。
 */
export function CatalogPage({ page }: CatalogPageProps) {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="relative w-full flex-1 bg-slate-100">
        {page.imageUrl ? (
          <Image
            src={page.imageUrl}
            alt={page.alt ?? page.displayName}
            fill
            unoptimized
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            画像なし
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-base font-semibold text-slate-900">
          {page.displayName}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href={page.xAccountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            X アカウントへ →
          </a>
          <a
            href={page.sourceTweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:underline"
          >
            元ツイートを開く
          </a>
        </div>
      </div>
    </div>
  );
}

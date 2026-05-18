import Image from "next/image";

interface CatalogEntryCardProps {
  imageUrl: string | null;
  alt: string | null;
  displayName: string;
  xAccountUrl: string;
}

/**
 * 1 投稿の表示カード。シンプル版 (Phase 4)。
 * Phase 5 では本めくり UI 内で `CatalogPage` に置き換わる。
 *
 * 画像クリック / 表示名タップで X アカウントが新規タブで開く。
 */
export function CatalogEntryCard({
  imageUrl,
  alt,
  displayName,
  xAccountUrl,
}: CatalogEntryCardProps) {
  return (
    <a
      href={xAccountUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={alt ?? displayName}
            fill
            unoptimized
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            画像なし
          </div>
        )}
      </div>
      <div className="space-y-0.5 p-3">
        <p className="font-medium text-slate-900">{displayName}</p>
        <p className="text-xs text-blue-600 group-hover:underline">
          X で見る →
        </p>
      </div>
    </a>
  );
}

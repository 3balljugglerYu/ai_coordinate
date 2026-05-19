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
  /** ページ番号（1 始まり）。本の外側角に薄く印字する */
  pageNumber: number;
  /** 見開き時の左右どちらか。中央折り目側の陰影とページ番号位置を切り替える */
  side: "left" | "right" | "single";
}

/**
 * 本の 1 ページ。書籍ページ風の紙面 (上半分: イラスト / 下半分: クレジット)。
 * 中央折り目側にうっすら陰影を付け、見開きの立体感を演出する。
 */
export function CatalogPage({ page, pageNumber, side }: CatalogPageProps) {
  const gutterClass =
    side === "left"
      ? "after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-stone-900/15 after:to-transparent after:pointer-events-none"
      : side === "right"
        ? "after:absolute after:inset-y-0 after:left-0 after:w-8 after:bg-gradient-to-r after:from-stone-900/15 after:to-transparent after:pointer-events-none"
        : "";

  // ページ番号は外側の角に置く (左ページは左下、右ページは右下、単独ページは中央下)
  const pageNumberAlignment =
    side === "right"
      ? "right-6"
      : side === "left"
        ? "left-6"
        : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-[#f4ead4] ${gutterClass}`}
      style={{
        // ベージュ紙風の微細グレイン (radial-gradient で軽量に表現)
        backgroundImage:
          "radial-gradient(rgba(110,80,40,0.045) 1px, transparent 1px), radial-gradient(rgba(110,80,40,0.035) 1px, transparent 1px)",
        backgroundSize: "5px 5px, 11px 11px",
        backgroundPosition: "0 0, 2px 3px",
      }}
    >
      {/* イラスト面: 紙の余白を残してマット風に置く */}
      <div className="flex flex-1 items-center justify-center px-6 pt-8 pb-4">
        <div className="relative h-full w-full overflow-hidden rounded-sm bg-[#fcf7e9] shadow-[inset_0_0_0_1px_rgba(110,80,40,0.18),0_2px_8px_rgba(60,40,20,0.08)]">
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
            <div
              className="flex h-full w-full items-center justify-center text-stone-400"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              画像なし
            </div>
          )}
        </div>
      </div>

      {/* クレジット面 */}
      <div className="border-t border-stone-700/15 px-8 pb-12 pt-5">
        <p
          className="text-center text-2xl tracking-wide text-stone-900"
          style={{
            fontFamily: "var(--font-cormorant), serif",
            fontWeight: 500,
            fontStyle: "italic",
          }}
        >
          {page.displayName}
        </p>
        {page.alt ? (
          <p
            className="mt-2 line-clamp-2 text-center text-sm leading-relaxed text-stone-600"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            {page.alt}
          </p>
        ) : null}
        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.18em] text-stone-500"
          style={{ fontFamily: "var(--font-libre), serif" }}
        >
          <a
            href={page.xAccountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-stone-400/60 pb-0.5 transition-colors hover:border-stone-900 hover:text-stone-900"
          >
            View on X
          </a>
          <a
            href={page.sourceTweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-stone-900"
          >
            Source tweet
          </a>
        </div>
      </div>

      {/* ページ番号 */}
      <span
        className={`pointer-events-none absolute bottom-3 ${pageNumberAlignment} text-[10px] tracking-[0.3em] text-stone-500`}
        style={{ fontFamily: "var(--font-libre), serif" }}
      >
        — {pageNumber} —
      </span>
    </div>
  );
}

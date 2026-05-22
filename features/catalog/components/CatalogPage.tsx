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
  /** ページ番号（1 始まり） */
  pageNumber: number;
  /** 見開き時の左右どちらか。中央折り目側の陰影を切り替える */
  side: "left" | "right" | "single";
}

/**
 * 本の 1 ページ。表紙 (BookCover) と同じく、作品画像をページ全面に object-cover で
 * 敷き詰め、下部グラデーション上に絵師名・リンク・ページ番号を重ねる。
 */
export function CatalogPage({ page, pageNumber, side }: CatalogPageProps) {
  // 中央折り目側 (右ページなら左端、左ページなら右端) にうっすら陰影を付ける。
  // single (portrait) は折り目が見えないので陰影なし。
  const gutterShadow =
    side === "left"
      ? "right-0 bg-gradient-to-l"
      : side === "right"
        ? "left-0 bg-gradient-to-r"
        : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1c130d]">
      {page.imageUrl ? (
        <Image
          src={page.imageUrl}
          alt={page.alt ?? page.displayName}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 760px"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-stone-400"
          style={{ fontFamily: "var(--font-libre), serif" }}
        >
          画像なし
        </div>
      )}

      {/* 下部グラデーション (クレジットの可読性確保) */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      {/* 薄い金箔風の枠 — 表紙とトーンを統一 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-3 rounded-sm border border-[#c9a961]/40"
      />

      {/* 中央折り目側の陰影 */}
      {gutterShadow != null ? (
        <div
          aria-hidden
          className={`absolute inset-y-0 w-10 from-black/40 to-transparent ${gutterShadow}`}
        />
      ) : null}

      {/* 下部のクレジット */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-7 pb-8 text-center">
        <h2
          className="text-2xl italic leading-snug text-[#f6e8c4] sm:text-3xl"
          style={{
            fontFamily: "var(--font-cormorant), serif",
            fontWeight: 500,
            textShadow: "0 2px 10px rgba(0,0,0,0.9)",
          }}
        >
          {page.displayName}
        </h2>
        {page.alt ? (
          <p
            className="mx-auto mt-1.5 line-clamp-2 max-w-xs text-xs leading-relaxed text-[#e6d0a0]/90"
            style={{
              fontFamily: "var(--font-libre), serif",
              textShadow: "0 1px 6px rgba(0,0,0,0.85)",
            }}
          >
            {page.alt}
          </p>
        ) : null}
        <div
          className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-[#d4b87a]"
          style={{
            fontFamily: "var(--font-libre), serif",
            textShadow: "0 1px 5px rgba(0,0,0,0.85)",
          }}
        >
          <a
            href={page.xAccountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-[#c9a961]/60 pb-0.5 transition-colors hover:border-[#f6e8c4] hover:text-[#f6e8c4]"
          >
            View on X
          </a>
          <a
            href={page.sourceTweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[#f6e8c4]"
          >
            Source tweet
          </a>
        </div>
        <p
          className="mt-3 text-[10px] tracking-[0.3em] text-[#d4b87a]/70"
          style={{
            fontFamily: "var(--font-libre), serif",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}
        >
          — {pageNumber} —
        </p>
      </div>
    </div>
  );
}

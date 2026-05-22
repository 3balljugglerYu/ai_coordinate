import Image from "next/image";

interface BookCoverProps {
  title: string;
  hashtag?: string | null;
  description?: string | null;
  variant: "front" | "back";
  /**
   * 表紙に表示するサムネイル画像 (campaign.cover_storage_path の signed URL)。
   * front かつ画像ありのときだけ全面の画像表紙にする。
   */
  coverImageUrl?: string | null;
}

/**
 * 本の表紙 / 裏表紙。
 * react-pageflip の showCover オプションと組み合わせて表示する。
 *
 * front:
 *  - coverImageUrl があれば、カタログ一覧と同じサムネイル画像を全面に敷き、
 *    下部のグラデーション上にタイトル / ハッシュタグを重ねる (雑誌・画集の表紙風)。
 *  - 画像が無ければ、深いバーガンディの革表紙風デザインにフォールバックする。
 * back: 革表紙風の奥付。
 */
export function BookCover({
  title,
  hashtag,
  description,
  variant,
  coverImageUrl,
}: BookCoverProps) {
  // front かつ画像あり → サムネイル画像を全面に敷いた表紙
  if (variant === "front" && coverImageUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#2e110d]">
        <Image
          src={coverImageUrl}
          alt={title}
          fill
          unoptimized
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 760px"
        />

        {/* 下部グラデーション (タイトルの可読性確保) */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent"
        />

        {/* 薄い金箔風の枠 — 本らしさを残す */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-sm border border-[#c9a961]/45"
        />

        {/* 中央折り目側の陰影 */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/45 to-transparent"
        />

        {/* 下部のタイトルブロック */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-7 pb-9 text-center">
          <p
            className="text-[10px] uppercase tracking-[0.4em] text-[#d4b87a]"
            style={{
              fontFamily: "var(--font-libre), serif",
              textShadow: "0 1px 4px rgba(0,0,0,0.75)",
            }}
          >
            Persta.AI Catalog
          </p>
          <div className="mx-auto my-3 h-px w-12 bg-[#c9a961]/70" />
          <h1
            className="text-3xl leading-snug text-[#f6e8c4] sm:text-4xl"
            style={{
              fontFamily: "var(--font-cormorant), serif",
              fontWeight: 500,
              letterSpacing: "0.01em",
              textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            {title}
          </h1>
          {hashtag ? (
            <p
              className="mt-3 text-xs tracking-[0.18em] text-[#e6d0a0]"
              style={{
                fontFamily: "var(--font-libre), serif",
                textShadow: "0 1px 6px rgba(0,0,0,0.85)",
              }}
            >
              #{hashtag}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // フォールバック: 画像なしの front / back は革表紙風デザイン
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{
        // 革表紙風: 深い赤茶 + 微細グレイン
        background:
          "radial-gradient(circle at 30% 20%, #6c2f24 0%, #4a1d18 70%, #2e110d 100%)",
        backgroundBlendMode: "multiply",
      }}
    >
      {/* 革のテクスチャ (細かいノイズ) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,220,180,0.08) 0.6px, transparent 0.6px), radial-gradient(rgba(0,0,0,0.18) 0.5px, transparent 0.5px)",
          backgroundSize: "3px 3px, 7px 7px",
          backgroundPosition: "0 0, 1px 2px",
        }}
      />

      {/* 二重の金箔風枠 */}
      <div className="absolute inset-6 rounded-sm border border-[#c9a961]/60" />
      <div className="absolute inset-8 rounded-sm border border-[#c9a961]/35" />

      {/* 中央のコンテンツ */}
      <div className="relative z-10 px-10 text-center">
        {variant === "front" ? (
          <>
            <p
              className="text-xs uppercase tracking-[0.45em] text-[#d4b87a]"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              Persta.AI Catalog
            </p>
            <div className="mx-auto my-6 h-px w-16 bg-[#c9a961]/70" />
            <h1
              className="text-4xl leading-snug text-[#f4e3b8] sm:text-5xl"
              style={{
                fontFamily: "var(--font-cormorant), serif",
                fontWeight: 500,
                letterSpacing: "0.01em",
              }}
            >
              {title}
            </h1>
            {hashtag ? (
              <p
                className="mt-6 text-sm tracking-[0.2em] text-[#d4b87a]"
                style={{ fontFamily: "var(--font-libre), serif" }}
              >
                #{hashtag}
              </p>
            ) : null}
            {description ? (
              <p
                className="mx-auto mt-6 max-w-xs text-sm italic leading-relaxed text-[#e6d0a0]/85"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                {description}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p
              className="text-xs uppercase tracking-[0.4em] text-[#d4b87a]"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              End of Volume
            </p>
            <div className="mx-auto my-5 h-px w-12 bg-[#c9a961]/60" />
            <p
              className="text-2xl italic text-[#f4e3b8]"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              Thank you for reading
            </p>
            <p
              className="mt-6 text-xs tracking-[0.18em] text-[#d4b87a]/80"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              persta.ai
            </p>
          </>
        )}
      </div>

      {/* 中央折り目側の陰影 */}
      <div
        aria-hidden
        className={`absolute inset-y-0 ${variant === "front" ? "right-0" : "left-0"} w-10 ${
          variant === "front"
            ? "bg-gradient-to-l from-black/40 to-transparent"
            : "bg-gradient-to-r from-black/40 to-transparent"
        }`}
      />
    </div>
  );
}

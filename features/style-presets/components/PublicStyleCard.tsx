import Link from "next/link";
import Image from "next/image";
import { localizePublicPath, type Locale } from "@/i18n/config";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/**
 * /styles(スタイル一覧)と /styles/[slug] の関連スタイルで使う公開スタイルカード。
 * 既定ではスタイル紹介ページへのリンクとして働く。
 *
 * onSelect を渡すと、通常の左クリック/タップだけを横取りして選択ハンドラを呼ぶ
 * (/styles 一覧の「試着しますか？」モーダル用)。href はそのまま残るため、
 * クローラーは紹介ページへのリンクとして辿れ、Cmd/Ctrl+クリックや中クリックの
 * 「新しいタブで開く」も既定どおり動く。
 */
export function PublicStyleCard({
  preset,
  locale,
  onSelect,
}: {
  preset: StylePresetPublicSummary;
  locale: Locale;
  onSelect?: (preset: StylePresetPublicSummary) => void;
}) {
  const categoryName =
    locale === "ja"
      ? preset.category.displayNameJa
      : preset.category.displayNameEn;

  return (
    <Link
      href={localizePublicPath(`/styles/${preset.slug}`, locale)}
      onClick={
        onSelect
          ? (event) => {
              if (
                event.defaultPrevented ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              onSelect(preset);
            }
          : undefined
      }
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100">
        <Image
          src={preset.thumbnailImageUrl}
          alt={preset.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover object-top transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">
          {preset.title}
        </p>
        <p className="text-xs text-gray-500">{categoryName}</p>
      </div>
    </Link>
  );
}

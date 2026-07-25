import Link from "next/link";
import Image from "next/image";
import { StyleProviderCredit } from "@/features/style/components/StyleProviderCredit";
import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";
import { localizePublicPath, type Locale } from "@/i18n/config";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/**
 * /styles(スタイル一覧)と /styles/[slug] の関連スタイルで使う公開スタイルカード。
 * 既定ではスタイル紹介ページへのリンクとして働く。
 *
 * カテゴリバッジと提供者クレジットは探索シートのカード
 * (StylePresetPreviewCard)と同じ意匠に揃える:
 *  - バッジは admin のプリセット管理で設定した badgeColor / badgeTextColor を使い、
 *    サムネ画像の左下に表示(顔まわりを覆わない配置)
 *  - default カテゴリの `coordinate` はバッジを描画しない(既存挙動と同じ)
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
  const badgeLocale = locale === "ja" ? "ja" : "en";
  const categoryName =
    badgeLocale === "ja"
      ? preset.category.displayNameJa
      : preset.category.displayNameEn;
  const shouldShowBadge = preset.category.key !== "coordinate";
  // 提供者クレジットはプリセット単位を優先し、無ければカテゴリ単位にフォールバック。
  const provider = resolveStylePresetProvider(preset);

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
        {shouldShowBadge && (
          <span
            className="absolute bottom-1.5 left-1.5 z-10 inline-flex max-w-[80%] items-center truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm"
            style={{
              backgroundColor: preset.category.badgeColor,
              color: preset.category.badgeTextColor,
            }}
            aria-label={categoryName}
          >
            {categoryName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-3">
        {provider && (
          <StyleProviderCredit
            nickname={provider.nickname}
            avatarUrl={provider.avatarUrl}
            locale={badgeLocale}
            iconOnly
            className="flex shrink-0 items-center"
          />
        )}
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">
          {preset.title}
        </p>
      </div>
    </Link>
  );
}

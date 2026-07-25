"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StyleProviderCredit } from "@/features/style/components/StyleProviderCredit";
import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

interface StyleTryOnConfirmDialogProps {
  /** 確認中のプリセット。null なら閉じる。 */
  preset: StylePresetPublicSummary | null;
  onOpenChange: (open: boolean) => void;
  /** 「試着する」確定。呼び出し側で /style への遷移などを行う。 */
  onConfirm: () => void;
  /** 提供者クレジットの「提供/by」接頭辞用 locale。 */
  locale: "ja" | "en";
  /**
   * プリセットID -> 累計生成数。「これまでに◯回つくられました」表示用
   * (0 または未指定のプリセットでは表示しない)。
   */
  generateTotals?: Readonly<Record<string, number>>;
}

/**
 * 「こちらを試着しますか？」の確認モーダル。
 * ホームのスタイルカルーセル・企画棚と /styles のギャラリーで共用する。
 *
 * 構成は探索シート(StyleBrowseSheet)の拡大プレビューに揃える:
 *  - 気軽に眺めて戻れるよう AlertDialog でなく通常の Dialog
 *    (枠外タップ・Esc・× で閉じられる)
 *  - 画像はサムネイルの実アスペクト比(横長はクロップせず全幅、縦長は幅280px)
 *  - タイトルの下に提供者クレジットと累計生成数
 *  - ボタンは「試着する」(上)・「他のスタイルをみる」(下)の縦積み
 */
export function StyleTryOnConfirmDialog({
  preset,
  onOpenChange,
  onConfirm,
  locale,
  generateTotals,
}: StyleTryOnConfirmDialogProps) {
  const t = useTranslations("style");
  const provider = resolveStylePresetProvider(preset);
  const generateTotal = preset ? (generateTotals?.[preset.id] ?? 0) : 0;

  return (
    <Dialog open={preset !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">
            {t("styleBrowseConfirmTitle")}
          </DialogTitle>
          {/* Radix の a11y 要件(aria-describedby)。視覚的には冗長なので sr-only。 */}
          <DialogDescription className="sr-only">
            {t("styleBrowseConfirmDescription")}
          </DialogDescription>
        </DialogHeader>
        {preset ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div
              className={`relative w-full overflow-hidden rounded-lg bg-gray-100 ${
                preset.thumbnailWidth > preset.thumbnailHeight
                  ? ""
                  : "max-w-[280px]"
              }`}
              style={{
                aspectRatio:
                  preset.thumbnailWidth > 0 && preset.thumbnailHeight > 0
                    ? `${preset.thumbnailWidth} / ${preset.thumbnailHeight}`
                    : "3 / 4",
              }}
            >
              <Image
                src={preset.thumbnailImageUrl}
                alt={t("styleCardAlt", { name: preset.title })}
                fill
                sizes="(max-width: 640px) 90vw, 480px"
                className="object-cover object-top"
              />
            </div>
            <p className="text-base font-medium text-slate-900">
              {preset.title}
            </p>
            {/* クリエイター表記(プリセット優先→カテゴリのフォールバック解決)。 */}
            {provider ? (
              <StyleProviderCredit
                nickname={provider.nickname}
                avatarUrl={provider.avatarUrl}
                locale={locale}
              />
            ) : null}
            {/* 累計利用回数(0回は出さない)。 */}
            {generateTotal > 0 ? (
              <p className="text-xs text-slate-500">
                {t("styleUsageCount", { count: generateTotal })}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button onClick={onConfirm}>{t("styleBrowseConfirmAction")}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("styleBrowseConfirmCancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

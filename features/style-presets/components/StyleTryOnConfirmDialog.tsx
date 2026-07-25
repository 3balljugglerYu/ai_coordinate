"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

interface StyleTryOnConfirmDialogProps {
  /** 確認中のプリセット。null なら閉じる。 */
  preset: StylePresetPublicSummary | null;
  onOpenChange: (open: boolean) => void;
  /** 「試着する」確定。呼び出し側で /style への遷移などを行う。 */
  onConfirm: () => void;
}

/**
 * 「こちらを試着しますか？」の確認モーダル。
 * ホームのスタイルカルーセル・企画棚と /styles のギャラリーで共用する。
 *
 * 気軽に眺めて戻れるよう AlertDialog ではなく通常の Dialog を使う
 * (探索シートの拡大プレビューと同じ方針。枠外タップ・Esc・× で閉じられる)。
 * 画像はサムネイルの実アスペクト比で表示する。横長はクロップせず全幅、
 * 縦長はダイアログが縦に伸びすぎないよう幅280pxに抑える。
 * 文言はホーム由来の home.stylePresetConfirm* キーを共通利用する。
 */
export function StyleTryOnConfirmDialog({
  preset,
  onOpenChange,
  onConfirm,
}: StyleTryOnConfirmDialogProps) {
  const t = useTranslations("style");
  const tHome = useTranslations("home");

  return (
    <Dialog open={preset !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">
            {tHome("stylePresetConfirmTitle")}
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
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tHome("stylePresetConfirmCancel")}
          </Button>
          <Button onClick={onConfirm}>
            {tHome("stylePresetConfirmAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

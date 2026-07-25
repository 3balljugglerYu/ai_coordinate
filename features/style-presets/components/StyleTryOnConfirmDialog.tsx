"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
 * ホームのスタイルカルーセルと /styles のギャラリーで共用する。
 *
 * 画像はサムネイルの実アスペクト比で表示する(探索シートと同じ挙動)。
 * 横長はクロップせず全幅、縦長はダイアログが縦に伸びすぎないよう幅280pxに抑える。
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
    <AlertDialog open={preset !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {tHome("stylePresetConfirmTitle")}
          </AlertDialogTitle>
        </AlertDialogHeader>
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
        <AlertDialogFooter>
          <AlertDialogCancel>
            {tHome("stylePresetConfirmCancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {tHome("stylePresetConfirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

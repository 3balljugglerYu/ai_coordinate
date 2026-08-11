"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { OneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

interface OneTapStyleDetailCardProps {
  preset: OneTapStylePresetMetadata;
  /**
   * このスタイルが閲覧者にとって開放済みか（ページ側で解決した値）。
   * `locked` のときは生成画面へ飛ばさず、その場で理由を伝える。
   */
  unlockState?: PresetUnlockState;
}

export function OneTapStyleDetailCard({
  preset,
  unlockState,
}: OneTapStyleDetailCardProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const locale = useLocale();
  const styleCardLocale = locale === "en" ? "en" : "ja";
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isLockedNoticeOpen, setIsLockedNoticeOpen] = useState(false);

  /*
    まだ開放されていないスタイルは、押しても生成画面へ飛ばさない。

    飛ばすと `?style=` が一覧に無いため黙って別のスタイルに差し替わり、
    「押し間違えた？」という状態になる。押した場所で理由を返す。
  */
  const isLocked = unlockState?.status === "locked";
  const lockedReason = unlockState?.status === "locked" ? unlockState.reason : null;

  const handleConfirm = () => {
    setIsConfirmOpen(false);
    router.push(`/style?style=${encodeURIComponent(preset.id)}`);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">
        {t("detailPresetLabel")}
      </p>
      <StylePresetPreviewCard
        preset={preset}
        alt={t("detailPresetCardAlt", { name: preset.title })}
        onClick={() =>
          isLocked ? setIsLockedNoticeOpen(true) : setIsConfirmOpen(true)
        }
        locale={styleCardLocale}
      />
      {/* 押す前に分かるよう、カードの下にも状態を出す */}
      {isLocked ? (
        <p
          className="flex items-center gap-1 text-xs font-medium text-amber-700"
          data-testid="one-tap-style-locked-label"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("presetLockedLabel")}
        </p>
      ) : null}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detailReuseConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("detailReuseConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detailReuseConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t("detailReuseConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isLockedNoticeOpen} onOpenChange={setIsLockedNoticeOpen}>
        <AlertDialogContent data-testid="one-tap-style-locked-notice">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("presetLockedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lockedReason === "prerequisite"
                ? t("presetLockedPrerequisiteDescription")
                : t("presetLockedSequentialDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsLockedNoticeOpen(false)}>
              {t("presetLockedAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

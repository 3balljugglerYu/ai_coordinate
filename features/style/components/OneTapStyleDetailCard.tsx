"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarOff, Lock } from "lucide-react";
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
import { PresetUnlockNoticeDialog } from "@/features/style/components/PresetUnlockNoticeDialog";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import { useStylePresetGenerationSheet } from "@/features/style/hooks/useStylePresetGenerationSheet";
import { UseCatalogButton } from "@/features/posts/components/UseStylePresetButton";
import type { OneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

interface OneTapStyleDetailCardProps {
  preset: OneTapStylePresetMetadata;
  /**
   * このスタイルが閲覧者にとって開放済みか（ページ側で解決した値）。
   * `locked` のときは生成画面へ飛ばさず、その場で理由を伝える。
   */
  unlockState?: PresetUnlockState;
  /**
   * 閲覧者。null は未ログイン。投稿詳細はサーバーで閲覧者を確定してから描くので、
   * 渡された時点で確定している。カタログ刷新後の生成シートで使う。
   */
  currentUserId?: string | null;
}

export function OneTapStyleDetailCard({
  preset,
  unlockState,
  currentUserId = null,
}: OneTapStyleDetailCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("style");
  // カタログ刷新後(公開前は運営だけ)は One-Tap Style を Persta ORIGINAL と呼ぶ
  const isCatalogRevamp = useStylesCatalogRevamp();
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
  // 未ログインは「開放されていない」ではなく「ログインすれば使える」
  const needsLogin = unlockState?.status === "login_required";
  /*
    会期が終わった企画。飛ばしても一覧に無いので黙って別のスタイルに差し替わる。
    locked と同じく、押した場所で理由を返す（開放待ちではなく「もう終わった」）。
  */
  const isEnded = unlockState?.status === "ended";
  const isBlocked = isLocked || needsLogin || isEnded;

  /*
    カタログ刷新後(公開前は運営だけ)は、User ORIGINAL と同じく、確認を挟まず
    その場で生成シートを開く(2026-10-01 ユーザー決定)。カードの下に
    「このカタログで生成する」も置き、カード自体を押しても同じシートを開く。
    使えないスタイル(未開放・要ログイン・会期終了)は従来どおり理由の案内を出す。
  */
  const generationSheet = useStylePresetGenerationSheet({
    presetId: preset.id,
    currentUserId,
    isViewerResolved: true,
  });

  const handleCardClick = () => {
    if (isBlocked) {
      setIsLockedNoticeOpen(true);
      return;
    }
    if (isCatalogRevamp) {
      void generationSheet.open();
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleConfirm = () => {
    setIsConfirmOpen(false);
    router.push(`/style?style=${encodeURIComponent(preset.id)}`);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">
        {t(isCatalogRevamp ? "detailPresetLabelRevamp" : "detailPresetLabel")}
      </p>
      <StylePresetPreviewCard
        preset={preset}
        alt={t("detailPresetCardAlt", { name: preset.title })}
        onClick={handleCardClick}
        locale={styleCardLocale}
      />
      {/* 押す前に分かるよう、カードの下にも状態を出す */}
      {isEnded ? (
        <p
          className="flex items-center gap-1 text-xs font-medium text-gray-500"
          data-testid="one-tap-style-ended-label"
        >
          <CalendarOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("presetEndedLabel")}
        </p>
      ) : isLocked || needsLogin ? (
        <p
          className="flex items-center gap-1 text-xs font-medium text-amber-700"
          data-testid="one-tap-style-locked-label"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {needsLogin ? t("presetLoginRequiredLabel") : t("presetLockedLabel")}
        </p>
      ) : isCatalogRevamp ? (
        <UseCatalogButton
          onClick={handleCardClick}
          isWorking={generationSheet.isWorking}
        />
      ) : null}
      {generationSheet.overlays}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detailReuseConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                isCatalogRevamp
                  ? "detailReuseConfirmDescriptionRevamp"
                  : "detailReuseConfirmDescription"
              )}
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

      <PresetUnlockNoticeDialog
        open={isLockedNoticeOpen}
        onOpenChange={setIsLockedNoticeOpen}
        unlockState={unlockState}
        onLogin={() =>
          router.push(`/login?redirect=${encodeURIComponent(pathname ?? "/")}`)
        }
      />
    </div>
  );
}

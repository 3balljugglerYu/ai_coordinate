"use client";

import { useTranslations } from "next-intl";
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
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

interface PresetUnlockNoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 案内の中身を決める解放状態(locked / login_required / ended)。 */
  unlockState: PresetUnlockState | null | undefined;
  /** 「ログイン」を押したとき(login_required のときだけ出る)。 */
  onLogin: () => void;
}

/**
 * まだ使えないスタイルを押したときの案内。押した場所で理由を返す。
 *
 * - locked: まだ開放されていない(前の企画を完走する / 生成すると次が開く)
 * - login_required: 未ログイン(ログインすれば使える)
 * - ended: 企画の会期が終わった
 *
 * 投稿詳細のカード(`OneTapStyleDetailCard`)と、`/styles` のカード
 * (`StylesGalleryClient`)で共用する。同じ状態への案内を2か所で書くと、
 * 文言や分岐がずれるため(計画書 ADR-010)。
 */
export function PresetUnlockNoticeDialog({
  open,
  onOpenChange,
  unlockState,
  onLogin,
}: PresetUnlockNoticeDialogProps) {
  const t = useTranslations("style");
  const lockedReason = unlockState?.status === "locked" ? unlockState.reason : null;
  // 未ログインは「開放されていない」ではなく「ログインすれば使える」
  const needsLogin = unlockState?.status === "login_required";
  // 会期が終わった企画(開放待ちではなく「もう終わった」)
  const isEnded = unlockState?.status === "ended";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="one-tap-style-locked-notice">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isEnded
              ? t("presetEndedTitle")
              : needsLogin
                ? t("presetLoginRequiredTitle")
                : t("presetLockedTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isEnded
              ? t("presetEndedDescription")
              : needsLogin
                ? t("presetLoginRequiredDescription")
                : lockedReason === "prerequisite"
                  ? t("presetLockedPrerequisiteDescription")
                  : t("presetLockedSequentialDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {needsLogin ? (
            <>
              <AlertDialogCancel>{t("presetLockedAction")}</AlertDialogCancel>
              <AlertDialogAction onClick={onLogin}>
                {t("presetLoginRequiredAction")}
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction onClick={() => onOpenChange(false)}>
              {t("presetLockedAction")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

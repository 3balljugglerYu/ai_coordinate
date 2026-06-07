"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { WardrobeClaimStatus } from "@/features/wardrobe/hooks/use-wardrobe-save";

export interface WardrobeClaimOverlayProps {
  status: WardrobeClaimStatus;
  /** 「マイページで見る」押下。 */
  onView: () => void;
  /** 保存完了表示を閉じる。 */
  onClose: () => void;
}

/**
 * ログイン後の claim 進行を全画面で表示するオーバーレイ。
 *
 * - "claiming": 「保存しています…」のブロッキング表示。背後の未ログイン用 UI を
 *   覆い、誤タップを防ぐ。
 * - "saved": 「保存しました！」+「マイページで見る」/「閉じる」。自動遷移しないため、
 *   保護ページへの自動遷移で再ログイン画面が挟まる問題が起きない。
 */
export function WardrobeClaimOverlay({
  status,
  onView,
  onClose,
}: WardrobeClaimOverlayProps) {
  const t = useTranslations("style");

  if (status === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/85 px-4 backdrop-blur-sm">
      {status === "claiming" ? (
        <div className="flex flex-col items-center gap-3 text-slate-700">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          <p className="text-sm font-medium">{t("wardrobeClaiming")}</p>
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
          <p className="text-lg font-bold text-slate-900">
            {t("wardrobeSaveSuccess")}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("wardrobeClaimSavedHint")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button type="button" onClick={onView}>
              {t("wardrobeViewSavedAction")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("wardrobeClaimCloseAction")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

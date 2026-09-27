"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { PromptLockedGenerationHeader } from "@/features/generation/components/PromptLockedGenerationHeader";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { useIsDesktopViewport } from "@/features/generation/hooks/useIsDesktopViewport";
import {
  checkAndTrackInProgressJob,
  pauseGenerationProgressBar,
  resumeGenerationProgressBarIfNeeded,
} from "@/features/generation/lib/generation-progress-store";
import { useGenerationProgressAvailable } from "@/features/generation/components/GenerationProgressAvailabilityProvider";
import { OneTapStyleGenerationForm } from "@/features/style/components/OneTapStyleGenerationForm";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface StyleGenerationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 押されたスタイル。シートの中ではこのスタイルに固定する。 */
  preset: StylePresetPublicSummary;
  subscriptionPlan: SubscriptionPlan;
  /** ポーズ指定欄(運営のみの先行公開)を出すか。サーバーでも検証される。 */
  canUseFreePose?: boolean;
}

/**
 * `/styles`(Persta.AI ORIGINAL)のカードから開く、One-Tap Style の生成シート。
 *
 * 外側は User ORIGINAL の生成シート(`PromptLockedGenerationSheet`)と同じ作りにする。
 * - モバイル: vaul の Drawer(下からせり上がり、先頭で下へ引くと閉じる。高さは画面の 92%)
 * - デスクトップ: 横長のモーダル(左に入力、右に生成結果)
 * - 開いている間は全体の生成中バーを止め、閉じたら進行中のジョブをバーへ引き継ぐ
 *
 * 中身は `/style` と同じ `OneTapStyleGenerationForm`(スタイルは固定)。
 * フォームを2つ持たない(計画書 ADR-001)。
 *
 * 開くのはログイン中だけ(未ログインは今の「試着確認 → /style」。計画書 §0-2)。
 * そのためフォームには `initialAuthState="authenticated"` を渡し、結果は
 * フォームの結果パネルではなく、シートの生成結果一覧で見せる(ADR-006)。
 *
 * 計画書: docs/planning/styles-generation-sheet-implementation-plan.md
 */
export function StyleGenerationSheet({
  open,
  onOpenChange,
  preset,
  subscriptionPlan,
  canUseFreePose = false,
}: StyleGenerationSheetProps) {
  const t = useTranslations("style");
  const isDesktop = useIsDesktopViewport();
  const backgroundProgressAvailable = useGenerationProgressAvailable();

  /*
    開いている間だけ全体の生成中バーを止める。
    `open` を見て判定する理由は PromptLockedGenerationSheet と同じ
    (閉じてもアンマウントしない呼び出し方でも、止めたままにならない)。
  */
  useEffect(() => {
    if (!backgroundProgressAvailable || !open) {
      return;
    }
    pauseGenerationProgressBar();
    return () => {
      resumeGenerationProgressBarIfNeeded();
    };
  }, [backgroundProgressAvailable, open]);

  /*
    閉じる直前に、進行中のジョブが無いかサーバーへ確認し、あれば全体の
    生成中バーで追い続ける。シートの中のフォームはアンマウントでポーリングを
    止めるだけで、/style のような再開キーは持たない(計画書 ADR-003)。
  */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && backgroundProgressAvailable) {
        void checkAndTrackInProgressJob();
      }
      onOpenChange(next);
    },
    [onOpenChange, backgroundProgressAvailable]
  );

  /*
    フォームは Fragment を返すので、/style のページと同じ間隔(space-y-8)の
    箱に入れる。
    見出しの残高は、読み込み前から枠とアイコンを出して数を「-」にする
    (取れてから枠を差し込むと段差が出るため。showBalancePlaceholder)。
  */
  const form = (
    <div className="space-y-8">
      <OneTapStyleGenerationForm
        variant="sheet"
        preset={preset}
        initialAuthState="authenticated"
        showResultPanel={false}
        subscriptionPlan={subscriptionPlan}
        canUseFreePose={canUseFreePose}
      />
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/*
          幅と高さは inline style で指定する(PromptLockedGenerationSheet と同じ理由:
          shadcn の sm:max-w-lg を Tailwind v4 の class で上書きしにくい)。
        */}
        <DialogContent
          className="flex flex-col p-0"
          style={{
            width: "min(95vw, 1100px)",
            maxWidth: "min(95vw, 1100px)",
            height: "85vh",
            maxHeight: "85vh",
          }}
        >
          {/* 読み上げ用。見出しは本文側の One-Tap Style 表記が担う。 */}
          <DialogHeader className="sr-only">
            <DialogTitle>{t("generationSheetTitle")}</DialogTitle>
            <DialogDescription>{t("generationSheetDescription")}</DialogDescription>
          </DialogHeader>

          <GenerationStateProvider>
            {/* 左: 入力 / 右: 生成結果。どちらも独立にスクロールさせる。 */}
            <div className="flex flex-1 gap-6 px-6 py-6" style={{ minHeight: 0 }}>
              <div className="w-1/2 space-y-6 overflow-y-auto pr-1">
                <PromptLockedGenerationHeader mode="style" showBalancePlaceholder />
                {form}
              </div>
              <div className="w-1/2 overflow-y-auto border-l pl-6">
                <PromptLockedGenerationResults generationType="one_tap_style" />
              </div>
            </div>
          </GenerationStateProvider>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ height: "92dvh", maxHeight: "92dvh" }}
        >
          {/* つまみ。ここを引くと閉じる(本文が先頭なら本文を引いても閉じる)。 */}
          <div className="flex-shrink-0">
            <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />
            {/* 読み上げ用。見出しは本文側の One-Tap Style 表記が担う。 */}
            <Drawer.Title className="sr-only">
              {t("generationSheetTitle")}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              {t("generationSheetDescription")}
            </Drawer.Description>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-8 pt-2">
            <PromptLockedGenerationHeader mode="style" showBalancePlaceholder />
            <GenerationStateProvider>
              {form}
              <PromptLockedGenerationResults generationType="one_tap_style" />
            </GenerationStateProvider>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

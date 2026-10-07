"use client";

import { useCallback, useEffect, useLayoutEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  closeGenerationScreen,
  GENERATION_SCREEN_ATTRIBUTE,
  notifyGenerationScreenShown,
} from "@/features/generation/lib/generation-screen-transition";
import {
  checkAndTrackInProgressJob,
  pauseGenerationProgressBar,
  resumeGenerationProgressBarIfNeeded,
} from "@/features/generation/lib/generation-progress-store";
import { useGenerationProgressAvailable } from "@/features/generation/components/GenerationProgressAvailabilityProvider";

interface GenerationScreenFrameProps {
  /** 上部バーの見出し(読み上げにも使う)。 */
  title: string;
  /** 直接 URL で来たときに、閉じたら行く画面。 */
  fallbackHref: string;
  /**
   * 全体の生成中バーへ引き継ぐか(未ログインは引き継がない。進行中のジョブを追えないため)。
   * シートのときと同じく、開いている間はバーを止め、離れるときに進行中のジョブをバーへ渡す。
   */
  handOffProgress: boolean;
  children: ReactNode;
}

/**
 * スマホの生成画面(全画面のページ)の外枠。ボトムシートの代わり(2026-10-07 ユーザー決定)。
 *
 * - 上部に「×」(閉じる)。下へ引いて閉じる操作は無い(ユーザー了承済み)
 * - 開閉の動きは generation-screen-transition.ts(下から上がる・下へ下がる)
 * - ページなので、キーボードの扱いはブラウザ標準(シートのように上下しない)
 */
export function GenerationScreenFrame({
  title,
  fallbackHref,
  handOffProgress,
  children,
}: GenerationScreenFrameProps) {
  const t = useTranslations("free");
  const router = useRouter();
  const backgroundProgressAvailable = useGenerationProgressAvailable();
  const shouldHandOff = backgroundProgressAvailable && handOffProgress;

  // 描かれたら、開くアニメーションを始める
  useLayoutEffect(() => {
    notifyGenerationScreenShown();
  }, []);

  /*
    開いている間は全体の生成中バーを止め、離れるとき(×・ブラウザの戻る)に進行中のジョブを
    バーへ渡す。シートの handleOpenChange と同じ役目を、ページの出入りで行う。
  */
  useEffect(() => {
    if (!shouldHandOff) return;
    pauseGenerationProgressBar();
    return () => {
      void checkAndTrackInProgressJob();
      resumeGenerationProgressBarIfNeeded();
    };
  }, [shouldHandOff]);

  const close = useCallback(() => {
    closeGenerationScreen(router, fallbackHref);
  }, [router, fallbackHref]);

  return (
    <div
      {...{ [GENERATION_SCREEN_ATTRIBUTE]: "" }}
      className="min-h-[100dvh] bg-white"
      data-testid="generation-screen"
    >
      {/* ⭐ fixed ではなく sticky(キーボード表示時のパンでずれない。#623 と同じ) */}
      <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-white/95 px-2 backdrop-blur">
        <button
          type="button"
          onClick={close}
          aria-label={t("generationScreenClose")}
          className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
          data-testid="generation-screen-close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>
      </div>
      <div className="space-y-6 px-4 pb-8 pt-3">{children}</div>
    </div>
  );
}

"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  closeGenerationScreen,
  GENERATION_SCREEN_ATTRIBUTE,
  notifyGenerationScreenShown,
  peekOpenedFromApp,
} from "@/features/generation/lib/generation-screen-transition";

/**
 * 生成画面(/generate/...)の読み込み中。押してすぐ下から上がり始めるように、
 * これが描かれた時点で開くアニメーションを始める(サーバーの判定を待たない)。
 * 形は GenerationScreenFrame と同じ(読み込みが終わっても位置が飛ばないように)。
 */
export function GenerationScreenLoading() {
  const t = useTranslations("free");
  const router = useRouter();
  useLayoutEffect(() => {
    notifyGenerationScreenShown();
  }, []);
  return (
    <div {...{ [GENERATION_SCREEN_ATTRIBUTE]: "" }} className="min-h-[100dvh] bg-white">
      <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-white/95 px-2">
        <button
          type="button"
          onClick={() => closeGenerationScreen(router, "/", peekOpenedFromApp())}
          aria-label={t("generationScreenClose")}
          className="grid h-10 w-10 place-items-center rounded-full text-gray-700"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="space-y-4 px-4 pt-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-slate-200" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { PromptLockedGenerationHeader } from "@/features/generation/components/PromptLockedGenerationHeader";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { useIsDesktopViewport } from "@/features/generation/hooks/useIsDesktopViewport";
import { fetchSourcePromptText } from "@/features/posts/lib/source-prompt-text-api";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface PromptLockedGenerationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 派生生成の原作 root 投稿 ID。 */
  sourcePostId: string;
  subscriptionPlan: SubscriptionPlan;
  /**
   * 原作のプロンプト公開設定。
   *
   * `public` のときだけ入力欄へ本文を表示する（編集は不可）。公開なのに
   * コピーしないと読めない状態を避けるためで、生成に使う本文は表示値ではなく
   * サーバーが原作の author secret から解決する。
   */
  promptVisibility: "public" | "private";
}

/**
 * 派生生成の入力面。
 *
 * じゆうモードの生成フォームをそのまま使い、プロンプト欄だけを施錠する。
 * 別フォームを作らないのは、比率・モデル・画像入力・ペルコイン残高確認・
 * ジョブのポーリング・進捗表示・結果表示までの一連の機構を二重に持つと
 * 片方だけ直す事故が起きるためである（過去に「片方だけ直して壊す」を
 * 繰り返している）。
 *
 * ## 見出しは Free Style に合わせる
 *
 * 中でやっていることは Free Style の生成そのものなので、`/free` のページ冒頭
 * （タイトル・説明・保有ペルコイン）と同じ並びにする。見出しだけ
 * 「このプロンプトで作る」にすると別機能に見えてしまう。
 *
 * ダイアログのタイトルは読み上げのために必要なので、視覚的には隠して残す。
 *
 * ## 画面幅で見せ方を変える
 *
 * - モバイル: 下から出るボトムシート
 * - デスクトップ: 横長のモーダル。左に入力、右に生成結果を並べる
 *
 * ボトムシートは指の届く範囲へ寄せる仕組みで、広い画面では縦に間延びし、
 * 左右が大きく余る。「画像を選ぶ」モーダルと同じ2カラムに寄せて、
 * 入力しながら結果を見られるようにする。
 *
 * ## 生成結果を必ず描画する
 *
 * `GenerationStateProvider` をシート内に置く。プロバイダはページ側にも
 * あるが、投稿詳細ページには無い。ここで包むことで、生成中の進捗と
 * 完了後のプレビューがこの中で完結する。
 *
 * 以前はプロバイダを置いただけで結果を描画するものが無く、生成しても
 * 完成画像が出ないままだった。`PromptLockedGenerationResults` が
 * `previewImages` を受け取って一覧にする。
 *
 * 本文はこのコンポーネントに一切入ってこない。渡すのは原作の投稿 ID だけで、
 * 本文はサーバーが provider 送信直前に author secret から解決する（REQ-005 /
 * REQ-007a）。
 */
export function PromptLockedGenerationSheet({
  open,
  onOpenChange,
  sourcePostId,
  subscriptionPlan,
  promptVisibility,
}: PromptLockedGenerationSheetProps) {
  const t = useTranslations("posts");
  const isDesktop = useIsDesktopViewport();
  const [lockedPromptText, setLockedPromptText] = useState<string | null>(null);

  /*
    公開プロンプトの本文は開いてから取りに行く。

    props へ載せると未フォロワーのブラウザにも届いてしまうため、
    サーバー側で認可する /api/posts/[id]/prompt-text 経由にする。
    取得に失敗しても生成自体は成立する（本文はサーバーが解決する）ので、
    表示だけ諦めてシートは開いたままにする。
  */
  useEffect(() => {
    if (!open || promptVisibility !== "public") {
      return;
    }
    let cancelled = false;
    fetchSourcePromptText(sourcePostId)
      .then((text) => {
        if (!cancelled) setLockedPromptText(text);
      })
      .catch(() => {
        if (!cancelled) setLockedPromptText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, promptVisibility, sourcePostId]);

  const form = (
    <GenerationFormContainer
      subscriptionPlan={subscriptionPlan}
      authState="authenticated"
      mode="free"
      promptLocked
      lockedPromptText={lockedPromptText}
      sourcePostId={sourcePostId}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/*
          幅と高さは inline style で指定する。shadcn の sm:max-w-lg と
          Tailwind v4 のスキャナ生成事情で class 上書きが効きにくい
          （「画像を選ぶ」モーダルと同じ理由・同じ書き方）。
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
          {/* 読み上げ用。見出しは本文側の Free Style 表記が担う。 */}
          <DialogHeader className="sr-only">
            <DialogTitle>{t("lockedSheetTitle")}</DialogTitle>
            <DialogDescription>{t("lockedSheetDescription")}</DialogDescription>
          </DialogHeader>

          <GenerationStateProvider>
            {/* 左: 入力 / 右: 生成結果。どちらも独立にスクロールさせる。 */}
            <div className="flex flex-1 gap-6 px-6 py-6" style={{ minHeight: 0 }}>
              <div className="w-1/2 space-y-6 overflow-y-auto pr-1">
                <PromptLockedGenerationHeader />
                {form}
              </div>
              <div className="w-1/2 overflow-y-auto border-l pl-6">
                <PromptLockedGenerationResults />
              </div>
            </div>
          </GenerationStateProvider>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl"
      >
        {/* 読み上げ用。見出しは本文側の Free Style 表記が担う。 */}
        <SheetHeader className="sr-only">
          <SheetTitle>{t("lockedSheetTitle")}</SheetTitle>
          <SheetDescription>{t("lockedSheetDescription")}</SheetDescription>
        </SheetHeader>

        {/* モバイルは縦に積む。入力の下に結果が続く。 */}
        <div className="space-y-6 px-4 pb-8 pt-4">
          <PromptLockedGenerationHeader />
          <GenerationStateProvider>
            {form}
            <PromptLockedGenerationResults />
          </GenerationStateProvider>
        </div>
      </SheetContent>
    </Sheet>
  );
}

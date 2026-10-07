"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { PromptLockedGenerationHeader } from "@/features/generation/components/PromptLockedGenerationHeader";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { useIsDesktopViewport } from "@/features/generation/hooks/useIsDesktopViewport";
import { usePromptLockedGenerationInputs } from "@/features/generation/hooks/usePromptLockedGenerationInputs";
import {
  isDesktopViewportNow,
  openGenerationScreen,
} from "@/features/generation/lib/generation-screen-transition";
import {
  checkAndTrackInProgressJob,
  pauseGenerationProgressBar,
  resumeGenerationProgressBarIfNeeded,
} from "@/features/generation/lib/generation-progress-store";
import { useGenerationProgressAvailable } from "@/features/generation/components/GenerationProgressAvailabilityProvider";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
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
 * - モバイル: 全画面の生成画面(ページ /generate/post/[id]。PromptLockedGenerationScreen)へ移る。
 *   開くと下から上がり、上部の × で下へ下がって元の画面に戻る(generation-screen-transition.ts)。
 *   以前は vaul のボトムシートだったが、名前の欄でキーボードを出すとシートが上下し、欄が
 *   キーボードの裏に隠れた(2026-10-07)。キーボードの扱いをブラウザ標準に任せるため、ページにした
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
  // カタログ刷新後(公開前は運営だけ)は、開いたボタンと同じ「このカタログで生成する」にする
  const isCatalogRevamp = useStylesCatalogRevamp();
  const sheetTitle = t(isCatalogRevamp ? "feedUseCatalog" : "lockedSheetTitle");
  const isDesktop = useIsDesktopViewport();
  const router = useRouter();

  /*
    スマホは全画面の生成画面(ページ)で開く(2026-10-07 ユーザー決定)。シートだと、
    名前の欄などでキーボードを出したときにシートが上下し、欄がキーボードの裏に隠れたため。
    開く瞬間に画面幅を測る(useIsDesktopViewport は測る前は false なので使わない)。
    呼び出し側の open は、移動したらすぐ閉じた扱いに戻す(戻ってきたときに開き直さない)。
    ダイアログを開いたまま画面が狭くなったとき(横向き→縦向き)も、生成画面へ移す
    (isDesktop を依存に入れて測り直す。何も出ずにボタンが効かなくなるのを防ぐ)。
  */
  useEffect(() => {
    if (!open || isDesktopViewportNow()) return;
    openGenerationScreen(router, `/generate/post/${encodeURIComponent(sourcePostId)}`);
    onOpenChange(false);
  }, [open, isDesktop, router, sourcePostId, onOpenChange]);

  /*
    段階公開（本番でまず運営のみ）。実機の完全なE2E検証が未実施のため、
    一般公開前に本番で自分だけ確認できる状態にしている。
    false のあいだはストア操作を一切行わない
    （ストアが populate されなければ GenerationProgressHost 側の
    ガードを待たずとも何も起きない、という二重の安全）。
  */
  const backgroundProgressAvailable = useGenerationProgressAvailable();

  /*
    ⭐ `open` prop の変化で判定する（mount/unmount では判定しない）。

    `FollowAndUsePromptButton` は `{isSheetOpen && ... ? (<Sheet/>) : null}`
    で閉じると unmount するが、`SourcePromptReferenceCard` は
    `{canGenerate ? (<Sheet open={isSheetOpen} .../>) : null}` で
    `canGenerate`（投稿詳細を見ている間はずっと true）だけを見ており、
    閉じても unmount しない。当初は「両呼び出し元とも閉じる＝即unmount」と
    誤認しており（PR #594 レビューで指摘）、mount/unmount だけで判定すると
    投稿詳細からの生成では resume が一生呼ばれず sheetOpenCount が
    上がったままになっていた。

    `open` を条件にも依存配列にも入れれば、unmount する呼び出し元・
    しない呼び出し元の両方で「開いている間だけ pause」が成立する
    （前者は unmount 時にこの effect 自身のクリーンアップが走るので、
    従来どおり正しく resume される）。
  */
  useEffect(() => {
    // スマホは生成画面(GenerationScreenFrame)が同じことをする
    if (!backgroundProgressAvailable || !open || !isDesktop) {
      return;
    }
    pauseGenerationProgressBar();
    return () => {
      resumeGenerationProgressBarIfNeeded();
    };
  }, [backgroundProgressAvailable, open, isDesktop]);

  /*
    シートを閉じる直前に、進行中のジョブが無いかサーバーへ確認する。
    見つかればバックグラウンド追跡を開始し、閉じた後もバーで進捗を追える
    ようにする（`GenerationStateContext` には一切触れない。ADR-001）。
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

  // 開いてから取りに行くもの(公開プロンプトの本文・名前の欄)。パソコンのダイアログで開いている間だけ
  const { lockedPromptText, lockedNameInput, lockedNameInputLoading } =
    usePromptLockedGenerationInputs({
      active: open && isDesktop,
      sourcePostId,
      promptVisibility,
    });

  const form = (
    <GenerationFormContainer
      subscriptionPlan={subscriptionPlan}
      authState="authenticated"
      mode="free"
      promptLocked
      lockedPromptText={lockedPromptText}
      sourcePostId={sourcePostId}
      lockedNameInput={lockedNameInput}
      // 取り終わるまでは生成させない(必須の名前を入れる前に送られないように)
      lockedNameInputLoading={lockedNameInputLoading}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
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
          {/* 読み上げ用。見出しは本文側の Free Style 表記(刷新後は「カタログから生成」)が担う。 */}
          <DialogHeader className="sr-only">
            <DialogTitle>{sheetTitle}</DialogTitle>
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

  // スマホは上の effect で生成画面へ移る(ここでは何も描かない)
  return null;
}

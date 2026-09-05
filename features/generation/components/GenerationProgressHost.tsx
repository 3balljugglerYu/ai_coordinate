"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import {
  clearTrackedGenerationJob,
  getGenerationProgressServerSnapshot,
  getGenerationProgressSnapshot,
  subscribeGenerationProgress,
} from "../lib/generation-progress-store";
import {
  getGenerationStatus,
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "../lib/async-api";
import { summarizeJobProgress } from "../lib/job-progress";
import { useGenerationProgressAvailable } from "./GenerationProgressAvailabilityProvider";
import type { ImageJobProcessingStage, ImageJobStatus } from "../lib/job-types";
import { GenerationProgressBar } from "./GenerationProgressBar";

interface TrackedJobSnapshot {
  status: ImageJobStatus;
  processingStage: ImageJobProcessingStage | null;
}

/**
 * 「このプロンプトで生成する」シートを閉じても、生成の進捗を見失わない
 * ようにするための、アプリに1つだけのホスト。
 *
 * ## なぜ要るのか
 *
 * `PromptLockedGenerationSheet` を生成中に閉じると `GenerationStateProvider`
 * ごと unmount され、進捗表示が失われる（サーバー側のジョブ自体は
 * `image-gen-worker` が処理するので止まらない）。投稿側の
 * `PostProgressHost` と同じ理由・同じ形で、ここに受け皿を作る。
 *
 * ## GenerationFormContainer からは何も借りない
 *
 * `generation-progress-store.ts` が持つのは `trackedJobId` だけ。
 * ここから先の進捗計算は、`GenerationFormContainer` が使っているのと同じ
 * **独立した部品**（`summarizeJobProgress`）をこのホスト自身が直接呼ぶ。
 * `GenerationStateContext` には一切触れない。
 *
 * ## 見た目は GenerationProgressBar(投稿の送信中バー相当)にした
 *
 * 当初は `GenerationStatusCard`（メッセージ・ライブメッセージ・フッター付き）
 * をそのまま流用していたが、実機で見た結果「情報過多で野暮ったい、投稿の
 * 送信中バーと同じ最小構成にしたい」との判断で、タイトル1行＋帯だけの
 * `GenerationProgressBar` に差し替えた。シートを開いている間に見える
 * `GenerationFormContainer` 内のカードはこれまで通り `GenerationStatusCard` の
 * ままで、変更していない。
 *
 * ## 完了時に「completing」状態を経由しない
 *
 * フォーム内のカードは完了後もしばらく完了演出を見せてから畳むが、
 * ここは見ている人がいない前提のバーなので、終端状態を検知した瞬間に
 * トーストを出してバーごと畳む。中途半端な「完了しかけ」の見た目を
 * 一瞬でも出す必要が無い。
 *
 * ## マウント位置
 *
 * `PostProgressHost` と同じく `LocaleShell` の Suspense 境界の**外側**に
 * 置くこと。`router.refresh()` 等で Suspense が再活性化したときに
 * unmount されると、追跡中のポーリングが打ち切られてしまう。
 */
export function GenerationProgressHost() {
  const t = useTranslations("coordinate");
  const router = useRouter();
  const { toast } = useToast();

  /*
    段階公開（本番でまず運営のみ）。実機の完全なE2E検証が未実施のため、
    一般公開前に本番で自分だけ確認できる状態にしている。
  */
  const available = useGenerationProgressAvailable();

  const { trackedJobId, sheetOpenCount, isReconciliationPending } =
    useSyncExternalStore(
      subscribeGenerationProgress,
      getGenerationProgressSnapshot,
      getGenerationProgressServerSnapshot
    );

  const [jobSnapshot, setJobSnapshot] = useState<TrackedJobSnapshot | null>(null);

  useEffect(() => {
    /*
      ⭐ `sheetOpenCount > 0` もここで止める（表示条件の `visible` だけに
      入れていたため、シートを開き直してもポーリングが裏で続き、
      完了検知でトースト＋ストアのクリアが起きていた。シート側の
      `GenerationFormContainer` も同じジョブを見ているため、シート内の
      完了表示とバックグラウンドの完了トーストが二重に出ていた。
      PR #594 レビューで指摘）。

      ⭐⭐ `isReconciliationPending` も止める。`checkAndTrackInProgressJob()`
      の問い合わせが解決するまでの間、`trackedJobId` は「まだ検証されていない
      値」のまま残る（ストア側は問い合わせ失敗時に既存の値を保持するため、
      ここで動いてしまうと確定前の古い状態をポーリングしてしまう）。
    */
    if (!available || sheetOpenCount > 0 || isReconciliationPending || !trackedJobId) {
      setJobSnapshot(null);
      return;
    }

    let isCancelled = false;
    let stop: (() => void) | null = null;
    setJobSnapshot(null);

    const finish = (status: AsyncGenerationStatus) => {
      if (isCancelled) return;
      setJobSnapshot(null);
      clearTrackedGenerationJob();

      if (status.status === "succeeded" && status.generatedImageId) {
        const generatedImageId = status.generatedImageId;
        toast({
          title: t("generationCompletedTitle"),
          action: (
            /*
              ボタンには見せない。投稿完了トーストの ToastAction と同じ作法
              （`PostProgressHost.tsx` を踏襲）。
            */
            <ToastAction
              altText={t("generationCompletedToastAction")}
              onClick={() =>
                // ⭐ from を付けない。付けるとどの画面から出たトーストでも
                // 戻る先がマイページに固定される(sticky-back-url.ts の
                // resolveStickyBackUrl)。from 無しなら履歴を戻る挙動になり、
                // 実際にいた画面へ正しく戻る(ADR-003)。
                router.push(`/posts/${encodeURIComponent(generatedImageId)}`)
              }
              className="h-auto rounded-none border-0 bg-transparent px-0 font-medium text-sky-600 underline underline-offset-4 hover:bg-transparent hover:text-sky-700"
            >
              {t("generationCompletedToastAction")}
            </ToastAction>
          ),
        });
        return;
      }

      toast({
        variant: "destructive",
        title: t("generationFailedTitle"),
      });
    };

    void (async () => {
      try {
        const current = await getGenerationStatus(trackedJobId);
        if (isCancelled) return;

        if (current.status === "succeeded" || current.status === "failed") {
          finish(current);
          return;
        }

        setJobSnapshot({
          status: current.status,
          processingStage: current.processingStage,
        });

        const polled = pollGenerationStatus(trackedJobId, {
          onStatusUpdate: (status) => {
            if (isCancelled) return;
            setJobSnapshot({
              status: status.status,
              processingStage: status.processingStage,
            });
          },
        });
        stop = polled.stop;

        const result = await polled.promise;
        if (isCancelled) return;
        finish(result);
      } catch (error) {
        // ⭐ 自分で stop() を呼んだ場合もここに来るが、その時点で isCancelled は
        // 既に true になっているため、以下は「本当にポーリングが失敗した
        // (10分タイムアウト含む)」場合にしか実行されない。
        // GenerationFormContainer.tsx の pollingStopped 判定と同じ考え方。
        if (isCancelled) return;
        console.error("Background generation polling failed:", error);
        setJobSnapshot(null);
        clearTrackedGenerationJob();
        toast({
          variant: "destructive",
          title: t("generationFailedTitle"),
        });
      }
    })();

    return () => {
      isCancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trackedJobId/available/sheetOpenCount/isReconciliationPending の変化だけで再実行したい
  }, [trackedJobId, available, sheetOpenCount, isReconciliationPending]);

  const visible = available && sheetOpenCount === 0 && jobSnapshot !== null;
  const progressPercent = jobSnapshot
    ? summarizeJobProgress([jobSnapshot]).progressPercent
    : 0;

  return <GenerationProgressBar visible={visible} progress={progressPercent} />;
}

"use client";

/**
 * 「このプロンプトで生成する」シートを閉じても失われない、
 * 生成中ジョブの追跡状態を1か所で受け取るための置き場。
 *
 * ## なぜ要るのか
 *
 * `PromptLockedGenerationSheet` を生成中に閉じると、`GenerationStateProvider`
 * ごと unmount され、進捗表示が失われる（サーバー側のジョブ自体は
 * `image-gen-worker` が処理するので止まらない）。投稿側が同じ課題を
 * `post-progress-store.ts` + `PostProgressHost.tsx` で解決しているので、
 * 同じ形を生成側にも作る。
 *
 * ## Provider ではなく module 変数にしている理由
 *
 * シートと、結果を出すホスト（`GenerationProgressHost`）は別のツリーにいる。
 * `post-progress-store.ts` と同じ理由で、Context ではなく module 変数にする。
 *
 * ## なぜシートを開いている「回数」で持つのか
 *
 * 単純な bool（`isSheetOpen`）ではなく `sheetOpenCount` にしている。
 * 呼び出し元は `FollowAndUsePromptButton` と `SourcePromptReferenceCard` の
 * 2箇所あり、将来どちらかの一覧内で複数枚同時に開ける形に変わっても、
 * 片方が閉じた瞬間にもう片方が開いたままバーが表示される事故を防げる。
 *
 * ## jobId をどう手に入れるか（GenerationStateContext には触れない）
 *
 * `PromptLockedGenerationSheet` は「隠す」のではなく、呼び出し元が
 * `{isSheetOpen && ... ? (<Sheet/>) : null}` という形で**毎回作り直す**実装
 * なので、閉じる＝即 unmount である。つまり、閉じる合図（`onOpenChange(false)`）
 * が来た時点でサーバーへ「いま進行中のジョブは？」と問い合わせれば、
 * シート内部の React state（`jobStatuses` 等）を外へ持ち出す配線が要らない。
 * `getInProgressJobs` は、シートを開き直したときの復旧と全く同じ API。
 */

import { getInProgressJobs } from "./async-api";

export interface GenerationProgressState {
  /** 追跡中のジョブID。MVPとして直近1件のみ（ADR-004）。 */
  trackedJobId: string | null;
  /**
   * 生成シートが開いているインスタンス数。
   * 0 より大きい間、バーは表示しない（二重表示防止）。
   */
  sheetOpenCount: number;
}

const INITIAL: GenerationProgressState = {
  trackedJobId: null,
  sheetOpenCount: 0,
};

let state: GenerationProgressState = INITIAL;
const listeners = new Set<() => void>();

function emit(next: GenerationProgressState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * シートを閉じた瞬間に呼ぶ。進行中のジョブがあれば直近1件を追跡対象にする。
 *
 * ⭐ 問い合わせ自体が失敗しても握りつぶす。バックグラウンドの補助機能であり、
 * 失敗してもシートを閉じる操作そのものをブロックしてはならない
 * （`PostModal.tsx` の `revalidate/home` 失敗時と同じ考え方）。
 *
 * ⭐⭐ 呼び出し側（`PromptLockedGenerationSheet`）はこの関数を `await` せず
 * `onOpenChange(next)` を続けて呼ぶ。そのため `sheetOpenCount` は、この
 * 問い合わせが解決するより先に 0 へ戻ることがある（むしろ通常はそうなる）。
 *
 * 問い合わせを始める**前**に、いま追跡している（かもしれない）jobId を
 * 即座に無効化しておく。こうしないと、`sheetOpenCount` が 0 に戻った瞬間
 * `GenerationProgressHost` のポーリング effect が「古い trackedJobId」で
 * 動き出し、この問い合わせより先に `getGenerationStatus()` が `succeeded`
 * を返してしまう。シート内で見届けた完了が、閉じた直後にもう一度
 * トーストとして出る（PR #594 のレビューで、前回の修正だけでは
 * このタイミング次第の抜け道が残っていると指摘された）。
 *
 * 先に null にしておけば、問い合わせが終わるまで Host は「追跡対象が無い」
 * ため何もしない。問い合わせが解決した時点で初めて、その時点の真の状態
 * （新しい jobId か、本当に何も無いか）を反映する。
 */
export async function checkAndTrackInProgressJob(): Promise<void> {
  clearTrackedGenerationJob();

  let jobs;
  try {
    jobs = await getInProgressJobs(false);
  } catch (error) {
    console.error("Failed to check in-progress jobs for background bar:", error);
    return;
  }

  if (jobs.length === 0) {
    // 上ですでに clear 済み。進行中が無いと確定しただけ。
    return;
  }

  // getInProgressJobs は created_at DESC で返す。ADR-004: 直近1件のみ追跡し、
  // 新しいジョブを検知したら上書きする。
  emit({ ...state, trackedJobId: jobs[0].id });
}

/** シートが開いた。バーを隠す。 */
export function pauseGenerationProgressBar() {
  emit({ ...state, sheetOpenCount: state.sheetOpenCount + 1 });
}

/** シートが閉じた。他に開いているシートが無ければバーを表示可能にする。 */
export function resumeGenerationProgressBarIfNeeded() {
  emit({ ...state, sheetOpenCount: Math.max(0, state.sheetOpenCount - 1) });
}

/** 追跡中のジョブが終端状態（成功・失敗）に達し、通知し終えた。 */
export function clearTrackedGenerationJob() {
  emit({ ...state, trackedJobId: null });
}

export function subscribeGenerationProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGenerationProgressSnapshot(): GenerationProgressState {
  return state;
}

/**
 * サーバー側のスナップショット。
 *
 * `useSyncExternalStore` はサーバーでもこれを呼ぶ。毎回新しい object を
 * 返すと無限ループになるので、**同じ参照**を返すこと。
 */
export function getGenerationProgressServerSnapshot(): GenerationProgressState {
  return INITIAL;
}

/** テスト用。module 変数なのでテスト間で持ち越さないよう明示的に戻す。 */
export function resetGenerationProgressStoreForTest() {
  state = INITIAL;
}

/** @jest-environment jsdom */

/**
 * 「このプロンプトで生成する」シートを閉じても失われない、
 * バックグラウンド生成の進捗を受け持つホスト。
 *
 * `PostProgressHost` と同じく、実物のストア（`generation-progress-store`）を
 * `resetGenerationProgressStoreForTest` で初期化しながら駆動する。
 * `async-api` だけをモックし、サーバーとのやり取りを制御する。
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { GenerationProgressHost } from "@/features/generation/components/GenerationProgressHost";
import {
  checkAndTrackInProgressJob,
  pauseGenerationProgressBar,
  resetGenerationProgressStoreForTest,
  resumeGenerationProgressBarIfNeeded,
} from "@/features/generation/lib/generation-progress-store";
import {
  getGenerationStatus,
  getInProgressJobs,
  pollGenerationStatus,
} from "@/features/generation/lib/async-api";
import type { AsyncGenerationStatus, JobStatus } from "@/features/generation/lib/async-api";

const toastMock = jest.fn();
const routerPushMock = jest.fn();

const COPY: Record<string, string> = {
  generatingStatusTitle: "画像を生成中...",
  generationCompletedTitle: "画像の生成が完了しました",
  generationCompletedToastAction: "確認する",
  generationFailedTitle: "画像を生成できませんでした",
};

// ⭐ 本物の next-intl の t は安定した参照を返す。ここで毎回新しい関数を
// 返すと、buildCoordinateStageCopy(t) を useMemo([t]) している箇所が
// 毎レンダー再計算され、useCoordinateGenerationFeedback 内部の
// useEffect(依存配列に stageCopy オブジェクト自体を含む)が無限ループする
// (実際に OOM で確認した)。モジュールスコープの同一参照を返すこと。
const tStable = (key: string) => COPY[key] ?? key;
jest.mock("next-intl", () => ({
  useTranslations: () => tStable,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => routerPushMock(...args) }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => toastMock(...args) }),
}));

jest.mock("@/features/generation/lib/async-api", () => ({
  getInProgressJobs: jest.fn(),
  getGenerationStatus: jest.fn(),
  pollGenerationStatus: jest.fn(),
}));

// ⭐ 既定は available(段階公開で運営に見えている状態)。false のケースは
// 専用の describe で個別に上書きする。
const mockUseGenerationProgressAvailable = jest.fn(() => true);
jest.mock("@/features/generation/components/GenerationProgressAvailabilityProvider", () => ({
  useGenerationProgressAvailable: () => mockUseGenerationProgressAvailable(),
}));

const mockGetInProgressJobs = getInProgressJobs as jest.MockedFunction<
  typeof getInProgressJobs
>;
const mockGetGenerationStatus = getGenerationStatus as jest.MockedFunction<
  typeof getGenerationStatus
>;
const mockPollGenerationStatus = pollGenerationStatus as jest.MockedFunction<
  typeof pollGenerationStatus
>;

function job(id: string): JobStatus {
  return {
    id,
    status: "processing",
    processingStage: "generating",
    createdAt: "2026-09-04T09:00:00Z",
  };
}

function status(overrides: Partial<AsyncGenerationStatus> = {}): AsyncGenerationStatus {
  return {
    id: "job-1",
    status: "processing",
    processingStage: "generating",
    previewImageUrl: null,
    resultImageUrl: null,
    errorMessage: null,
    generatedImageId: null,
    ...overrides,
  };
}

/** テストから任意のタイミングで解決/棄却できる pollGenerationStatus のスタブ。 */
function deferredPoll() {
  const stop = jest.fn();
  let resolvePromise!: (value: AsyncGenerationStatus) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<AsyncGenerationStatus>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  mockPollGenerationStatus.mockReturnValue({ promise, stop });
  return { stop, resolve: resolvePromise, reject: rejectPromise };
}

async function trackJob() {
  mockGetInProgressJobs.mockResolvedValue([job("job-1")]);
  await act(async () => {
    await checkAndTrackInProgressJob();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseGenerationProgressAvailable.mockReturnValue(true);
  resetGenerationProgressStoreForTest();
  document.body.className = "";
});

describe("GenerationProgressHost", () => {
  test("追跡中のジョブが無ければ何も描画しない", () => {
    render(<GenerationProgressHost />);
    expect(screen.queryByText("画像を生成中...")).not.toBeInTheDocument();
  });

  test("ジョブを検知すると生成中タイトルでバーを出す", async () => {
    mockGetGenerationStatus.mockResolvedValue(status());
    deferredPoll();

    render(<GenerationProgressHost />);
    await trackJob();

    await waitFor(() =>
      expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
    );
  });

  /*
    ⭐ シートが開いている間は、追跡中のジョブがあってもバーを出さない
    （二重表示防止）だけでなく、**ポーリング自体を止める**こと。

    以前は表示条件（visible）だけが sheetOpenCount を見ており、
    ポーリングを行う useEffect の依存配列には含まれていなかった。
    そのため、シートを開き直しても裏で pollGenerationStatus が続き、
    完了検知でトースト＋ストアのクリアが起きていた。開いたシート側の
    GenerationFormContainer も同じジョブを見ているため、シート内の
    完了表示とバックグラウンドの完了トーストが二重に出ていた
    （PR #594 レビューで指摘）。
  */
  test("⭐シートを開くとポーリングを止め、閉じ直すと取り直す", async () => {
    mockGetGenerationStatus.mockResolvedValue(status());
    const firstPoll = deferredPoll();

    render(<GenerationProgressHost />);
    await trackJob();
    await waitFor(() =>
      expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
    );

    // シートを開く(sheetOpenCount 0→1)。バーが隠れるだけでなく、
    // 進行中だったポーリングの stop() が呼ばれること。
    act(() => {
      pauseGenerationProgressBar();
    });
    expect(screen.queryByText("画像を生成中...")).not.toBeInTheDocument();
    expect(firstPoll.stop).toHaveBeenCalledTimes(1);

    // 止めた後に元のポーリングが解決しても、トーストは出ない
    // (isCancelled ガードにより、シートを開いている間の完了を無視する)。
    await act(async () => {
      firstPoll.resolve(status({ status: "succeeded", generatedImageId: "img-1" }));
    });
    expect(toastMock).not.toHaveBeenCalled();

    // シートを閉じる(sheetOpenCount 1→0)。取り直しのため
    // getGenerationStatus がもう一度呼ばれ、まだ進行中ならバーが復帰する。
    mockGetGenerationStatus.mockClear();
    mockGetGenerationStatus.mockResolvedValue(status());
    const secondPoll = deferredPoll();
    act(() => {
      resumeGenerationProgressBarIfNeeded();
    });
    await waitFor(() => expect(mockGetGenerationStatus).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
    );

    // 取り直した2回目のポーリングは生きている
    await act(async () => {
      secondPoll.resolve(status({ status: "succeeded", generatedImageId: "img-2" }));
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
  });

  test("送信中だけボトムナビを隠し、終わったら必ず戻す", async () => {
    mockGetGenerationStatus.mockResolvedValue(status());
    const poll = deferredPoll();

    render(<GenerationProgressHost />);
    expect(document.body).not.toHaveClass("generation-progress-active");

    await trackJob();
    await waitFor(() =>
      expect(document.body).toHaveClass("generation-progress-active")
    );

    await act(async () => {
      poll.resolve(status({ status: "succeeded", generatedImageId: "img-1" }));
    });

    await waitFor(() =>
      expect(document.body).not.toHaveClass("generation-progress-active")
    );
  });

  describe("完了時", () => {
    test("成功したら完了トーストを出し、確認するタップでfromパラメータ無しの詳細ページへ遷移する", async () => {
      mockGetGenerationStatus.mockResolvedValue(status());
      const poll = deferredPoll();

      render(<GenerationProgressHost />);
      await trackJob();
      await waitFor(() =>
        expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
      );

      await act(async () => {
        poll.resolve(status({ status: "succeeded", generatedImageId: "img-1" }));
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      const call = toastMock.mock.calls[0][0];
      expect(call.title).toBe("画像の生成が完了しました");

      // ToastAction をレンダーして onClick を発火させる
      render(<div>{call.action}</div>);
      screen.getByText("確認する").click();

      // ⭐ from パラメータを付けない（ADR-003。付けると戻る先がマイページに固定される）
      expect(routerPushMock).toHaveBeenCalledWith("/posts/img-1");

      // バーは畳まれる
      expect(screen.queryByText("画像を生成中...")).not.toBeInTheDocument();
    });

    test("失敗したら失敗トーストを出す", async () => {
      mockGetGenerationStatus.mockResolvedValue(status());
      const poll = deferredPoll();

      render(<GenerationProgressHost />);
      await trackJob();
      await waitFor(() =>
        expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
      );

      await act(async () => {
        poll.resolve(status({ status: "failed", errorMessage: "boom" }));
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "画像を生成できませんでした",
        })
      );
      expect(screen.queryByText("画像を生成中...")).not.toBeInTheDocument();
    });

    /*
      ⭐ 追跡開始時点で既に succeeded/failed だった場合、pollGenerationStatus
      すら呼ばずに即トーストへ倒すこと（GenerationFormContainer と同じ作法）。
    */
    test("追跡開始時点で既に完了していればポーリングせず即トーストにする", async () => {
      mockGetGenerationStatus.mockResolvedValue(
        status({ status: "succeeded", generatedImageId: "img-2" })
      );

      render(<GenerationProgressHost />);
      await trackJob();

      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(mockPollGenerationStatus).not.toHaveBeenCalled();
    });

    /*
      ⭐ 10分のタイムアウトも失敗として扱う。pollGenerationStatus の reject を
      「止められた(pollingStopped)」と区別せず終端の失敗として処理する。
    */
    test("ポーリングがタイムアウトで拒否されても失敗トーストを出す", async () => {
      mockGetGenerationStatus.mockResolvedValue(status());
      const poll = deferredPoll();

      render(<GenerationProgressHost />);
      await trackJob();
      await waitFor(() =>
        expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
      );

      await act(async () => {
        poll.reject(new Error("ポーリングがタイムアウトしました"));
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      );
    });
  });

  /*
    ⭐ 段階公開: available が false の間は、追跡中のジョブがあっても
    何も描画しない（本番でまず運営のみに見せるため）。
  */
  describe("段階公開でavailableがfalseのとき", () => {
    test("追跡中のジョブがあってもバーを描画しない", async () => {
      mockUseGenerationProgressAvailable.mockReturnValue(false);
      mockGetGenerationStatus.mockResolvedValue(status());
      deferredPoll();

      render(<GenerationProgressHost />);
      await trackJob();

      expect(screen.queryByText("画像を生成中...")).not.toBeInTheDocument();
      // ⭐ ポーリング自体も始めない(無駄なリクエストを打たない)
      expect(mockPollGenerationStatus).not.toHaveBeenCalled();
    });
  });

  /*
    ⭐ unmount 時に自分で stop() を呼んだ場合は、それに続く reject を
    失敗として扱わない（isCancelled ガードで抑止する）。
  */
  test("unmount時はstopを呼び、その後のrejectでトーストを出さない", async () => {
    mockGetGenerationStatus.mockResolvedValue(status());
    const poll = deferredPoll();

    const { unmount } = render(<GenerationProgressHost />);
    await trackJob();
    await waitFor(() =>
      expect(screen.getByText("画像を生成中...")).toBeInTheDocument()
    );

    unmount();
    expect(poll.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      poll.reject(new Error("ポーリングが停止されました"));
    });

    expect(toastMock).not.toHaveBeenCalled();
  });
});

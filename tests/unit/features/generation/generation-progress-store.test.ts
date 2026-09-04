/** @jest-environment jsdom */

jest.mock("@/features/generation/lib/async-api", () => ({
  getInProgressJobs: jest.fn(),
}));

import { getInProgressJobs } from "@/features/generation/lib/async-api";
import {
  checkAndTrackInProgressJob,
  clearTrackedGenerationJob,
  getGenerationProgressSnapshot,
  pauseGenerationProgressBar,
  resetGenerationProgressStoreForTest,
  resumeGenerationProgressBarIfNeeded,
} from "@/features/generation/lib/generation-progress-store";
import type { JobStatus } from "@/features/generation/lib/async-api";

const mockGetInProgressJobs = getInProgressJobs as jest.MockedFunction<
  typeof getInProgressJobs
>;

function job(id: string, createdAt: string): JobStatus {
  return { id, status: "processing", processingStage: "generating", createdAt };
}

describe("generation-progress-store", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    resetGenerationProgressStoreForTest();
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("checkAndTrackInProgressJob", () => {
    test("進行中のジョブが無ければ何もしない", async () => {
      mockGetInProgressJobs.mockResolvedValue([]);

      await checkAndTrackInProgressJob();

      expect(getGenerationProgressSnapshot().trackedJobId).toBeNull();
    });

    /*
      ⭐ getInProgressJobs は created_at DESC で返す(API 側で確認済み)。
      ADR-004: MVPとして直近1件のみ追跡するので、配列の先頭を採用する。
    */
    test("直近1件を追跡対象にする", async () => {
      mockGetInProgressJobs.mockResolvedValue([
        job("job-new", "2026-09-04T10:00:00Z"),
        job("job-old", "2026-09-04T09:00:00Z"),
      ]);

      await checkAndTrackInProgressJob();

      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-new");
    });

    test("新しいジョブを検知したら上書きする", async () => {
      mockGetInProgressJobs.mockResolvedValueOnce([job("job-1", "2026-09-04T09:00:00Z")]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-1");

      mockGetInProgressJobs.mockResolvedValueOnce([job("job-2", "2026-09-04T10:00:00Z")]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-2");
    });

    /*
      ⭐ バックグラウンドの補助機能なので、問い合わせ自体が失敗しても
      握りつぶす。シートを閉じる操作そのものをブロックしてはならない。
    */
    test("問い合わせが失敗しても例外を投げない", async () => {
      mockGetInProgressJobs.mockRejectedValue(new Error("network error"));

      await expect(checkAndTrackInProgressJob()).resolves.toBeUndefined();
      expect(getGenerationProgressSnapshot().trackedJobId).toBeNull();
    });

    test("既定では queued/processing のみを対象にする(includeRecentを渡さない)", async () => {
      mockGetInProgressJobs.mockResolvedValue([]);

      await checkAndTrackInProgressJob();

      expect(mockGetInProgressJobs).toHaveBeenCalledWith(false);
    });

    /*
      ⭐ PR #594 レビュー2巡目で指摘された競合の回帰テスト。

      呼び出し側(PromptLockedGenerationSheet)はこの関数を await せず
      onOpenChange(next) を続けて呼ぶため、sheetOpenCount はこの問い合わせが
      解決するより先に 0 へ戻ることがある。その間 trackedJobId が古い値の
      ままだと、GenerationProgressHost のポーリング effect が
      sheetOpenCount の変化だけで動き出し、この問い合わせより先に
      「古いjobIdの現在の状態」を取得してしまう。シート内で見届けた
      完了が、閉じた直後にもう一度トーストとして出る。

      問い合わせを始める**前**に trackedJobId を同期的に無効化していれば、
      問い合わせが解決するまでの間、Host は「追跡対象が無い」ため
      何もしない。
    */
    test("⭐問い合わせが解決するより前にtrackedJobIdを同期的に無効化する", async () => {
      // 既に job-old を追跡している状態を作る
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-old", "2026-09-04T09:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-old");

      // 次の問い合わせは、テストが明示的に解決するまで pending のままにする
      let resolveJobs!: (jobs: JobStatus[]) => void;
      mockGetInProgressJobs.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveJobs = resolve;
        })
      );

      const pending = checkAndTrackInProgressJob();

      // ⭐ ここが本題。await する前(=問い合わせがまだ解決していない時点)で
      // 既に trackedJobId が null になっていること。
      // これが無いと、sheetOpenCount が先に 0 へ戻った瞬間、Host が
      // "job-old" のまま古い状態を取りに行ってしまう。
      expect(getGenerationProgressSnapshot().trackedJobId).toBeNull();

      // 問い合わせが解決すると、その時点の真の状態が反映される
      resolveJobs([job("job-new", "2026-09-04T10:00:00Z")]);
      await pending;
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-new");
    });

    test("⭐無効化後に問い合わせが空配列で解決してもnullのまま", async () => {
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-old", "2026-09-04T09:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-old");

      let resolveJobs!: (jobs: JobStatus[]) => void;
      mockGetInProgressJobs.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveJobs = resolve;
        })
      );

      const pending = checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBeNull();

      resolveJobs([]);
      await pending;
      expect(getGenerationProgressSnapshot().trackedJobId).toBeNull();
    });
  });

  describe("pause/resume のカウンタ", () => {
    test("開いているシートが無ければ0", () => {
      expect(getGenerationProgressSnapshot().sheetOpenCount).toBe(0);
    });

    test("pauseで増え、resumeで減る", () => {
      pauseGenerationProgressBar();
      expect(getGenerationProgressSnapshot().sheetOpenCount).toBe(1);

      resumeGenerationProgressBarIfNeeded();
      expect(getGenerationProgressSnapshot().sheetOpenCount).toBe(0);
    });

    /*
      ⭐ 複数のシート呼び出し元が同時に開いても、片方が閉じた瞬間に
      もう片方が開いたままバーが表示される事故を防ぐためのカウンタ。
    */
    test("2つ開いて1つだけ閉じても0にならない", () => {
      pauseGenerationProgressBar();
      pauseGenerationProgressBar();
      resumeGenerationProgressBarIfNeeded();

      expect(getGenerationProgressSnapshot().sheetOpenCount).toBe(1);
    });

    test("0を下回らない", () => {
      resumeGenerationProgressBarIfNeeded();
      expect(getGenerationProgressSnapshot().sheetOpenCount).toBe(0);
    });
  });

  test("clearTrackedGenerationJobでtrackedJobIdだけがnullになる", async () => {
    pauseGenerationProgressBar();
    mockGetInProgressJobs.mockResolvedValue([job("job-1", "2026-09-04T09:00:00Z")]);
    await checkAndTrackInProgressJob();

    clearTrackedGenerationJob();

    expect(getGenerationProgressSnapshot()).toEqual({
      trackedJobId: null,
      sheetOpenCount: 1,
    });
  });
});

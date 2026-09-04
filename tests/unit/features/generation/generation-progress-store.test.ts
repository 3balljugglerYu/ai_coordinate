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

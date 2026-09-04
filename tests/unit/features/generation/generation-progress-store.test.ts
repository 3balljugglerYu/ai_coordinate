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
      何も追跡していなかった状態からの失敗は、そのまま何も追跡しない。
    */
    test("何も追跡していない状態で問い合わせが失敗しても例外を投げない", async () => {
      mockGetInProgressJobs.mockRejectedValue(new Error("network error"));

      await expect(checkAndTrackInProgressJob()).resolves.toBeUndefined();
      expect(getGenerationProgressSnapshot()).toEqual({
        trackedJobId: null,
        sheetOpenCount: 0,
        isReconciliationPending: false,
      });
    });

    test("既定では queued/processing のみを対象にする(includeRecentを渡さない)", async () => {
      mockGetInProgressJobs.mockResolvedValue([]);

      await checkAndTrackInProgressJob();

      expect(mockGetInProgressJobs).toHaveBeenCalledWith(false);
    });
  });

  /*
    ⭐⭐ PR #594 レビュー3巡目で指摘された内容の回帰テスト。

    2巡目の修正（問い合わせ前に trackedJobId を同期で null にする）は、
    「シート内で見届けた完了が閉じた直後にもう一度トーストとして出る」
    競合は防げたが、**問い合わせ自体が失敗したときに正規の追跡を失う**
    新しい退行を生んでいた。既にバックグラウンドでジョブAを追跡中に、
    別のシートを開閉しただけでこの問い合わせが一時的なネットワーク不調で
    失敗すると、ジョブAはまだ進行中なのにバー・ポーリング・完了通知が
    失われる。

    `trackedJobId` には触れず、`isReconciliationPending` で
    Host のポーリングだけを止める設計に直した。承認条件（レビュー本文より）:
      1. 照会中は既存ポーリングが停止し、古いIDの status API を呼ばない
      2. 照会成功時は空配列なら追跡解除、ジョブありなら最新IDへ置換する
      3. 照会失敗時は既存の trackedJobId を保持し、Host がそのIDの
         追跡を再開する
      4. 先行した古い照会結果が後発の照会結果を上書きしない
  */
  describe("checkAndTrackInProgressJob の照会中ガード(isReconciliationPending)", () => {
    test("問い合わせ中はtrackedJobIdに触れず、isReconciliationPendingだけtrueにする（条件1）", async () => {
      // 既に job-A を追跡している状態を作る
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-A", "2026-09-04T09:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot()).toMatchObject({
        trackedJobId: "job-A",
        isReconciliationPending: false,
      });

      // 次の問い合わせは、テストが明示的に解決するまで pending のままにする
      let resolveJobs!: (jobs: JobStatus[]) => void;
      mockGetInProgressJobs.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveJobs = resolve;
        })
      );

      const pending = checkAndTrackInProgressJob();

      // ⭐ await する前(=問い合わせがまだ解決していない時点)で、
      // trackedJobId は job-A のまま・isReconciliationPending だけ true。
      expect(getGenerationProgressSnapshot()).toEqual({
        trackedJobId: "job-A",
        sheetOpenCount: 0,
        isReconciliationPending: true,
      });

      resolveJobs([job("job-A", "2026-09-04T09:00:00Z")]);
      await pending;
    });

    test("照会成功時、空配列なら追跡解除・ジョブがあれば最新IDへ置換する（条件2）", async () => {
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-A", "2026-09-04T09:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-A");

      mockGetInProgressJobs.mockResolvedValueOnce([]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot()).toMatchObject({
        trackedJobId: null,
        isReconciliationPending: false,
      });

      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-B", "2026-09-04T10:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot()).toMatchObject({
        trackedJobId: "job-B",
        isReconciliationPending: false,
      });
    });

    /*
      ⭐⭐ レビューが名指しした回帰テスト:
      「既存IDあり → 照会pending → Host停止 → 照会reject → 既存IDで追跡再開」
    */
    test("⭐既存IDあり→照会pending→照会失敗→既存IDを保持したまま追跡再開できる（条件3）", async () => {
      // 既存ID(job-A)を確立する
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-A", "2026-09-04T09:00:00Z"),
      ]);
      await checkAndTrackInProgressJob();
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-A");

      // 別のシートの開閉が失敗する問い合わせを発火させる
      mockGetInProgressJobs.mockRejectedValueOnce(new Error("network error"));
      await checkAndTrackInProgressJob();

      // ⭐ 失敗しても job-A は失われない。isReconciliationPending は false に戻る
      // (Host はここで trackedJobId="job-A" を使ってポーリングを再開できる)。
      expect(getGenerationProgressSnapshot()).toEqual({
        trackedJobId: "job-A",
        sheetOpenCount: 0,
        isReconciliationPending: false,
      });
    });

    /*
      ⭐ 先行した古い照会結果が後発の照会結果を上書きしない（条件4）。
      シートを立て続けに開閉すると問い合わせが重複して発火しうる。
    */
    test("⭐古い問い合わせの応答が後発の応答より遅れて届いても上書きしない", async () => {
      let resolveFirst!: (jobs: JobStatus[]) => void;
      mockGetInProgressJobs.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      );
      const first = checkAndTrackInProgressJob();

      // 1回目がまだ解決しないうちに、2回目(より新しい)を発火する
      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-new", "2026-09-04T10:00:00Z"),
      ]);
      const second = checkAndTrackInProgressJob();
      await second;
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-new");

      // 1回目(古い)が今頃になって解決しても、2回目の結果を上書きしない
      resolveFirst([job("job-old", "2026-09-04T09:00:00Z")]);
      await first;
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-new");
    });

    test("古い問い合わせが後発より先に失敗しても、後発の結果を上書きしない", async () => {
      let rejectFirst!: (error: Error) => void;
      mockGetInProgressJobs.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
      );
      const first = checkAndTrackInProgressJob();

      mockGetInProgressJobs.mockResolvedValueOnce([
        job("job-new", "2026-09-04T10:00:00Z"),
      ]);
      const second = checkAndTrackInProgressJob();
      await second;
      expect(getGenerationProgressSnapshot().trackedJobId).toBe("job-new");

      rejectFirst(new Error("network error"));
      await first;
      expect(getGenerationProgressSnapshot()).toMatchObject({
        trackedJobId: "job-new",
        isReconciliationPending: false,
      });
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
      isReconciliationPending: false,
    });
  });
});

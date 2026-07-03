/**
 * `/api/collections/unlock-announcements` 先読みキャッシュの回帰テスト。
 *
 * - prefetch 直後の getUnlockAnnouncements は同一 Promise を再利用する(fetch 1回のみ)。
 * - 一度 get すると消費済みになり、次の get は再フェッチする。
 * - 先読みが無い/古い(30秒超)場合は getUnlockAnnouncements がその場で fetch する。
 * - 先読みの fetch が失敗しても getUnlockAnnouncements は自前で再取得できる。
 *
 * モジュールはリクエスト横断の先読みキャッシュを module スコープで保持するため、
 * テスト専用の resetUnlockAnnouncementsPrefetchForTests で各テストの先頭を必ず空にする。
 */
import {
  getUnlockAnnouncements,
  prefetchUnlockAnnouncements,
  resetUnlockAnnouncementsPrefetchForTests,
} from "@/features/collections/lib/unlock-announcements-prefetch";

function mockFetchOnce(body: unknown, ok = true) {
  return jest.fn().mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

describe("unlock-announcements-prefetch", () => {
  beforeEach(() => {
    resetUnlockAnnouncementsPrefetchForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("prefetch 済みなら getUnlockAnnouncements は追加 fetch せず同じ結果を返す", async () => {
    const fetchMock = mockFetchOnce({ announcements: [{ categoryKey: "a" }] });
    global.fetch = fetchMock as unknown as typeof fetch;

    prefetchUnlockAnnouncements();
    const data = await getUnlockAnnouncements();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.announcements).toEqual([{ categoryKey: "a" }]);
  });

  it("get で一度消費すると、次の get は再フェッチする", async () => {
    const first = mockFetchOnce({ announcements: [{ categoryKey: "a" }] });
    global.fetch = first as unknown as typeof fetch;
    prefetchUnlockAnnouncements();
    await getUnlockAnnouncements();

    const second = mockFetchOnce({ announcements: [{ categoryKey: "b" }] });
    global.fetch = second as unknown as typeof fetch;
    const data = await getUnlockAnnouncements();

    expect(second).toHaveBeenCalledTimes(1);
    expect(data.announcements).toEqual([{ categoryKey: "b" }]);
  });

  it("prefetch していなければ getUnlockAnnouncements がその場で fetch する(フォールバック)", async () => {
    const fetchMock = mockFetchOnce({ announcements: [] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const data = await getUnlockAnnouncements();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.announcements).toEqual([]);
  });

  it("短時間の連続 prefetch 呼び出しは二重フェッチしない", async () => {
    const fetchMock = mockFetchOnce({ announcements: [] });
    global.fetch = fetchMock as unknown as typeof fetch;

    prefetchUnlockAnnouncements();
    prefetchUnlockAnnouncements();
    prefetchUnlockAnnouncements();
    await getUnlockAnnouncements();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("30秒以上経過した先読みは古いとみなし、get はその場で再取得する", async () => {
    jest.useFakeTimers();
    const stale = mockFetchOnce({ announcements: [{ categoryKey: "old" }] });
    global.fetch = stale as unknown as typeof fetch;
    prefetchUnlockAnnouncements();

    jest.advanceTimersByTime(31_000);

    const fresh = mockFetchOnce({ announcements: [{ categoryKey: "fresh" }] });
    global.fetch = fresh as unknown as typeof fetch;
    const data = await getUnlockAnnouncements();

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(data.announcements).toEqual([{ categoryKey: "fresh" }]);
  });

  it("先読みの fetch が失敗しても getUnlockAnnouncements は自前で再取得して復帰できる", async () => {
    const failing = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ announcements: [] }),
    });
    global.fetch = failing as unknown as typeof fetch;
    prefetchUnlockAnnouncements();
    // prefetch の内部失敗ハンドリング(promise.catch)が走るのを待つ。
    await Promise.resolve();
    await Promise.resolve();

    const recovery = mockFetchOnce({ announcements: [{ categoryKey: "ok" }] });
    global.fetch = recovery as unknown as typeof fetch;
    const data = await getUnlockAnnouncements();

    expect(recovery).toHaveBeenCalledTimes(1);
    expect(data.announcements).toEqual([{ categoryKey: "ok" }]);
  });
});

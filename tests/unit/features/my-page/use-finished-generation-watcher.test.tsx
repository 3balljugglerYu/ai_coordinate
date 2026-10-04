/**
 * @jest-environment jsdom
 *
 * マイページを開いているあいだ、生成中のものが終わったら知らせる。
 * ⭐ 生成中のものが無ければ1回確かめるだけ。同時に複数あっても1回の問い合わせで全部見る。
 */

const mockGetInProgressJobs = jest.fn();
jest.mock("@/features/generation/lib/async-api", () => ({
  getInProgressJobs: (...args: unknown[]) => mockGetInProgressJobs(...args),
}));

import { act, renderHook } from "@testing-library/react";
import {
  FINISHED_GENERATION_POLL_INTERVAL_MS,
  useFinishedGenerationWatcher,
} from "@/features/my-page/hooks/useFinishedGenerationWatcher";

const job = (id: string) => ({ id, status: "processing", processingStage: null, createdAt: "" });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function tick() {
  await act(async () => {
    jest.advanceTimersByTime(FINISHED_GENERATION_POLL_INTERVAL_MS);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGetInProgressJobs.mockReset();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("useFinishedGenerationWatcher", () => {
  test("生成中のものが無ければ、開いたときに1回確かめるだけ", async () => {
    mockGetInProgressJobs.mockResolvedValue([]);
    const onFinished = jest.fn();
    await act(async () => {
      renderHook(() => useFinishedGenerationWatcher(onFinished));
    });

    await tick();
    await tick();

    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
  });

  test("同時に複数あっても1回の問い合わせで見て、終わるたびに知らせ、無くなったら止める", async () => {
    mockGetInProgressJobs
      .mockResolvedValueOnce([job("a"), job("b")])
      .mockResolvedValueOnce([job("a"), job("b")])
      .mockResolvedValueOnce([job("b")])
      .mockResolvedValueOnce([]);
    const onFinished = jest.fn();
    await act(async () => {
      renderHook(() => useFinishedGenerationWatcher(onFinished));
    });

    await tick(); // まだ2件とも生成中
    expect(onFinished).not.toHaveBeenCalled();
    await tick(); // a が終わった
    expect(onFinished).toHaveBeenCalledTimes(1);
    await tick(); // b も終わった → 止まる
    expect(onFinished).toHaveBeenCalledTimes(2);

    await tick();
    await tick();
    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(4);
  });

  test("タブを裏に回しているあいだは問い合わせず、戻ったら続きから確かめる", async () => {
    mockGetInProgressJobs
      .mockResolvedValueOnce([job("a")])
      .mockResolvedValueOnce([]);
    const onFinished = jest.fn();
    await act(async () => {
      renderHook(() => useFinishedGenerationWatcher(onFinished));
    });

    setVisibility("hidden");
    await tick();
    await tick();
    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(1);

    // 裏にいたあいだに a が終わっていた
    await act(async () => {
      setVisibility("visible");
    });
    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(2);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  test("画面を離れたら止める", async () => {
    mockGetInProgressJobs.mockResolvedValue([job("a")]);
    let unmount = () => {};
    await act(async () => {
      ({ unmount } = renderHook(() => useFinishedGenerationWatcher(jest.fn())));
    });

    unmount();
    await tick();
    await tick();

    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(1);
  });

  test("問い合わせが続けて失敗したら、見張りをやめる", async () => {
    mockGetInProgressJobs
      .mockResolvedValueOnce([job("a")])
      .mockRejectedValue(new Error("network"));
    await act(async () => {
      renderHook(() => useFinishedGenerationWatcher(jest.fn()));
    });

    for (let i = 0; i < 10; i += 1) await tick();

    // 最初の1回 + 失敗5回で止まる
    expect(mockGetInProgressJobs).toHaveBeenCalledTimes(6);
  });
});

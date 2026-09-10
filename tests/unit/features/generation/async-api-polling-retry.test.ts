/** @jest-environment jsdom */

import {
  generateImageAsync,
  getGenerationStatus,
  pollGenerationStatus,
} from "@/features/generation/lib/async-api";
import type { GenerationRequest } from "@/features/generation/types";

/**
 * 2026-09-10 の実障害の回帰テスト。
 *
 * 92 秒かかる生成の途中でモバイル回線が一瞬切れただけで、
 *   1. ポーリングが 1 回の失敗で打ち切られ
 *   2. ブラウザの生メッセージ("Load failed")がそのまま画面に出て
 *   3. サーバーでは走り続けているジョブを UI が見失う
 * という事故が起きた。ここでは 1 と 2 を固定する。
 */

const NETWORK_POLLING_MESSAGE = "通信が不安定です(polling)";
const NETWORK_SUBMIT_MESSAGE = "通信が不安定です(submit)";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function statusBody(status: string) {
  return {
    id: "job-1",
    status,
    processingStage: status === "succeeded" ? "completed" : "generating",
    resultImageUrl: status === "succeeded" ? "https://example.com/a.png" : null,
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("getGenerationStatus: fetch が拒否したとき", () => {
  test("ブラウザの生メッセージではなくロケール済み文言を投げる", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Load failed")) as unknown as typeof fetch;

    await expect(
      getGenerationStatus("job-1", {
        networkErrorPolling: NETWORK_POLLING_MESSAGE,
      })
    ).rejects.toThrow(NETWORK_POLLING_MESSAGE);
  });

  test("HTTP エラー(4xx/5xx)はサーバーの文言をそのまま使う", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "ジョブが見つかりません" }),
    }) as unknown as typeof fetch;

    await expect(
      getGenerationStatus("job-1", {
        networkErrorPolling: NETWORK_POLLING_MESSAGE,
      })
    ).rejects.toThrow("ジョブが見つかりません");
  });
});

describe("generateImageAsync: fetch が拒否したとき", () => {
  test("送信用のロケール済み文言を投げる", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    const request: GenerationRequest = {
      prompt: "猫",
      sourceImageStockId: "11111111-1111-1111-1111-111111111111",
      model: "gpt-image-2-low-1k",
    };

    await expect(
      generateImageAsync(request, {
        networkErrorSubmit: NETWORK_SUBMIT_MESSAGE,
      })
    ).rejects.toThrow(NETWORK_SUBMIT_MESSAGE);
  });
});

describe("pollGenerationStatus: 一時的な取得失敗", () => {
  test("1 回失敗しても追跡を諦めず、回復したら完了を返す", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(jsonResponse(statusBody("succeeded")));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", {
      interval: 10,
      messages: { networkErrorPolling: NETWORK_POLLING_MESSAGE },
    });

    await jest.advanceTimersByTimeAsync(5000);
    const status = await promise;

    expect(status.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("4 回続けて失敗しても、5 回目に回復すれば完了を返す", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(jsonResponse(statusBody("succeeded")));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", {
      interval: 10,
      messages: { networkErrorPolling: NETWORK_POLLING_MESSAGE },
    });

    // 2 + 4 + 8 + 16 = 30 秒の猶予を使い切る手前で回復する
    await jest.advanceTimersByTimeAsync(35000);
    await expect(promise).resolves.toMatchObject({ status: "succeeded" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  test("5 回連続で失敗したら諦め、生メッセージではなく日本語で reject する", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError("Load failed"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", {
      interval: 10,
      messages: { networkErrorPolling: NETWORK_POLLING_MESSAGE },
    });
    const assertion = expect(promise).rejects.toThrow(NETWORK_POLLING_MESSAGE);

    await jest.advanceTimersByTimeAsync(35000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  test("待ち時間が指数で伸びる(2s → 4s → 8s → 16s)", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError("Load failed"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", {
      interval: 10,
      messages: { networkErrorPolling: NETWORK_POLLING_MESSAGE },
    });
    // reject を拾い損ねて unhandled rejection にしないよう先に繋いでおく
    const assertion = expect(promise).rejects.toThrow(NETWORK_POLLING_MESSAGE);

    // 初回の失敗直後。次は 2 秒後なので、1.9 秒では叩かれない
    await jest.advanceTimersByTimeAsync(1900);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(200); // 2.1s: 2 回目
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(3800); // 5.9s: 3 回目は 6.0s なのでまだ
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(200); // 6.1s: 3 回目(4 秒待ち)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(8000); // 14.1s: 4 回目(8 秒待ち)
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await jest.advanceTimersByTimeAsync(16000); // 30.1s: 5 回目(16 秒待ち)で断念
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await assertion;
  });

  test("ジョブ自体の失敗は reject ではなく failed として resolve する", async () => {
    jest.useFakeTimers();
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(statusBody("failed"))) as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", { interval: 10 });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toMatchObject({ status: "failed" });
  });
});

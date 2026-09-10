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

  test("2 回続けて失敗しても、3 回目に回復すれば完了を返す", async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(jsonResponse(statusBody("succeeded")));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { promise } = pollGenerationStatus("job-1", {
      interval: 10,
      messages: { networkErrorPolling: NETWORK_POLLING_MESSAGE },
    });

    await jest.advanceTimersByTimeAsync(20000);
    await expect(promise).resolves.toMatchObject({ status: "succeeded" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("3 回連続で失敗したら諦め、生メッセージではなく日本語で reject する", async () => {
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

    await jest.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

/** @jest-environment node */

import { generateImageAsync } from "@/features/generation/lib/async-api";
import type { GenerationRequest } from "@/features/generation/types";

function mockFetchOnce(): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: "job-1", status: "queued" }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function getSentBody(fetchMock: jest.Mock): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

const base: GenerationRequest = {
  prompt: "猫",
  sourceImageStockId: "11111111-1111-1111-1111-111111111111",
  model: "gpt-image-2-low-1k",
};

describe("generateImageAsync: outputAspectRatioMode payload", () => {
  test("free + 明示比率は payload に載る", async () => {
    const fetchMock = mockFetchOnce();
    await generateImageAsync({
      ...base,
      generationType: "free",
      outputAspectRatioMode: "3:4",
    });
    expect(getSentBody(fetchMock).outputAspectRatioMode).toBe("3:4");
  });

  test("free + source は payload に載らない(既定=非上書き)", async () => {
    const fetchMock = mockFetchOnce();
    await generateImageAsync({
      ...base,
      generationType: "free",
      outputAspectRatioMode: "source",
    });
    expect("outputAspectRatioMode" in getSentBody(fetchMock)).toBe(false);
  });

  test("coordinate では比率を渡しても payload に載らない(free 限定)", async () => {
    const fetchMock = mockFetchOnce();
    await generateImageAsync({
      ...base,
      generationType: "coordinate",
      outputAspectRatioMode: "3:4",
    });
    expect("outputAspectRatioMode" in getSentBody(fetchMock)).toBe(false);
  });
});

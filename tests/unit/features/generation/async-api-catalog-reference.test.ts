/** @jest-environment node */

/**
 * 生成の依頼に、見本(参照画像)の id とまねるものを載せる決まり(generateImageAsync)。
 * じゆうモードで、id とまねるもの(1つ以上)が両方あるときだけ載せる(schema が片方だけを 400 にする)。
 */

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

function sentBody(fetchMock: jest.Mock): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

const base: GenerationRequest = {
  prompt: "猫",
  sourceImageStockId: "11111111-1111-1111-1111-111111111111",
  model: "gpt-image-2-low-1k",
};

test("じゆうモードで id とまねるものがあれば載せる", async () => {
  const fetchMock = mockFetchOnce();
  await generateImageAsync({
    ...base,
    generationType: "free",
    referenceImageId: "ref-1",
    referenceTakes: ["outfit", "pose"],
  });
  expect(sentBody(fetchMock)).toMatchObject({ referenceImageId: "ref-1", referenceTakes: ["outfit", "pose"] });
});

test.each([
  ["じゆうモード以外", { generationType: "coordinate" as const, referenceImageId: "ref-1", referenceTakes: ["outfit" as const] }],
  ["まねるものが空", { generationType: "free" as const, referenceImageId: "ref-1", referenceTakes: [] }],
  ["id が無い", { generationType: "free" as const, referenceTakes: ["outfit" as const] }],
])("%s なら、どちらも載せない", async (_label, extra) => {
  const fetchMock = mockFetchOnce();
  await generateImageAsync({ ...base, ...extra });
  const body = sentBody(fetchMock);
  expect("referenceImageId" in body).toBe(false);
  expect("referenceTakes" in body).toBe(false);
});

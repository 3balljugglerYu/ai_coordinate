/** @jest-environment node */

/**
 * 応答を返したあとに回す仕事(runAfterResponse)。
 * after() が使えないときは、待たずにその場で始める。どちらでも投げない。
 */

jest.mock("server-only", () => ({}));
const afterMock = jest.fn();
jest.mock("next/server", () => ({ after: (fn: () => unknown) => afterMock(fn) }));

import { runAfterResponse } from "@/features/monetization/lib/after-response";

beforeEach(() => {
  afterMock.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("after() に渡し、その場では動かさない", () => {
  const task = jest.fn(async () => {});
  runAfterResponse(task);
  expect(afterMock).toHaveBeenCalledTimes(1);
  expect(task).not.toHaveBeenCalled();
});

test("after() が投げたら(リクエストの外など)、その場で始める", async () => {
  afterMock.mockImplementation(() => {
    throw new Error("outside request scope");
  });
  const task = jest.fn(async () => {});
  expect(() => runAfterResponse(task)).not.toThrow();
  expect(task).toHaveBeenCalledTimes(1);
});

test("仕事が失敗しても投げない", async () => {
  afterMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  const task = jest.fn(async () => {
    throw new Error("db down");
  });
  expect(() => runAfterResponse(task)).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
  expect(task).toHaveBeenCalled();
});

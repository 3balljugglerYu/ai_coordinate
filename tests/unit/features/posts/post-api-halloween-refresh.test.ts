/**
 * 投稿・キャプションの編集・投稿の取り消しに成功したら、ハロウィン企画の対象作品を取り直す。
 * 2026-10-22 ユーザー指示: 投稿してすぐ「このカタログで生成する」をハロウィン仕様にしたい。
 *
 * useHalloweenTargets は jest.setup.js で全体をモックしている。ここでは呼ばれたかだけ見る
 * (取り直しの中身は use-halloween-targets.test.tsx)。
 */

import { deletePost, postImageAPI, updatePostCaption } from "@/features/posts/lib/api";
import { refreshHalloweenTargetsAfterPostChange } from "@/features/campaigns/halloween/hooks/useHalloweenTargets";

const mockRefresh = refreshHalloweenTargetsAfterPostChange as jest.MockedFunction<
  typeof refreshHalloweenTargetsAfterPostChange
>;

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  mockRefresh.mockClear();
  fetchMock = jest.fn(async () => jsonResponse({ id: "post-1" }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe.each([
  ["投稿", () => postImageAPI({ id: "post-1", caption: "#うちの子のベストショット" })],
  ["キャプションの編集", () => updatePostCaption({ id: "post-1", caption: "#うちの子のベストショット" })],
  ["投稿の取り消し", () => deletePost("post-1")],
])("%s", (_label, run) => {
  test("成功したら対象作品を取り直す", async () => {
    await run();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test("失敗したら取り直さない", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "x" }, false));
    await expect(run()).rejects.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

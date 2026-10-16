/**
 * ハロウィン企画の対象作品の判定(2026-10-16 ユーザー指示: 対象作品にラベルと企画仕様のボタン)。
 *
 * - 出すのは期間中(10/16 20:00 〜 11/1 0:00 の手前)・日本語の画面だけ
 * - 対象作品の ID は API から1回だけ取り、カードどうしで使い回す
 * - 取れなければ空(普段の見た目)。画面は止めない
 * - サーバーで描くときは出さない(ハイドレーションで食い違わないように)
 *
 * jest.setup.js で全体は「対象作品なし」に固定しているので、ここでは本物を読み込む。
 */

import React from "react";
import { renderToString } from "react-dom/server.node";
import { act, render, screen, waitFor } from "@testing-library/react";

const mockLocale = jest.fn<string, []>(() => "ja");
jest.mock("next-intl", () => ({
  useLocale: () => mockLocale(),
}));

const actual = jest.requireActual<
  typeof import("@/features/campaigns/halloween/hooks/useHalloweenTargets")
>("@/features/campaigns/halloween/hooks/useHalloweenTargets");
const { useHalloweenTargetPostIds, useIsHalloweenTarget, resetHalloweenTargetsForTest } = actual;

const BEFORE_START = Date.parse("2026-10-16T19:59:59+09:00");
const AT_START = Date.parse("2026-10-16T20:00:00+09:00");
const LAST_SECOND = Date.parse("2026-10-31T23:59:59+09:00");
const AT_END = Date.parse("2026-11-01T00:00:00+09:00");

const TARGETS_URL = "/api/hashtag-campaigns/halloween-best-shot/targets";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

let fetchMock: jest.Mock;
let nowSpy: jest.SpyInstance<number, []>;

function setNow(ms: number) {
  nowSpy.mockReturnValue(ms);
}

function Probe({ postId, testId }: { postId: string | null; testId: string }) {
  const isTarget = useIsHalloweenTarget(postId);
  return <span data-testid={testId}>{isTarget ? "target" : "plain"}</span>;
}

function SizeProbe() {
  const ids = useHalloweenTargetPostIds();
  return <span data-testid="size">{ids.size}</span>;
}

beforeEach(() => {
  resetHalloweenTargetsForTest();
  mockLocale.mockReturnValue("ja");
  fetchMock = jest.fn(async () => jsonResponse({ postIds: ["post-a", "post-b"] }));
  global.fetch = fetchMock as unknown as typeof fetch;
  nowSpy = jest.spyOn(Date, "now");
  setNow(AT_START);
});

afterEach(() => {
  nowSpy.mockRestore();
});

describe("useIsHalloweenTarget", () => {
  test("始まる前(10/16 19:59:59)は出さず、API も呼ばない", async () => {
    setNow(BEFORE_START);
    render(<Probe postId="post-a" testId="a" />);
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("始まった瞬間(10/16 20:00)から、対象作品にだけ true", async () => {
    render(
      <>
        <Probe postId="post-a" testId="a" />
        <Probe postId="post-x" testId="x" />
      </>
    );
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe("target"));
    expect(screen.getByTestId("x").textContent).toBe("plain");
    expect(fetchMock).toHaveBeenCalledWith(TARGETS_URL);
  });

  test("カードがいくつあっても API は1回だけ", async () => {
    render(
      <>
        <Probe postId="post-a" testId="a" />
        <Probe postId="post-b" testId="b" />
        <Probe postId="post-c" testId="c" />
        <SizeProbe />
      </>
    );
    await waitFor(() => expect(screen.getByTestId("size").textContent).toBe("2"));
    expect(screen.getByTestId("b").textContent).toBe("target");
    expect(screen.getByTestId("c").textContent).toBe("plain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("最後の1秒(10/31 23:59:59)までは出す", async () => {
    setNow(LAST_SECOND);
    render(<Probe postId="post-a" testId="a" />);
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe("target"));
  });

  test("終わった瞬間(11/1 0:00)からは出さず、API も呼ばない", async () => {
    setNow(AT_END);
    render(<Probe postId="post-a" testId="a" />);
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("日本語以外の画面では出さず、API も呼ばない(企画は日本国内向け)", async () => {
    mockLocale.mockReturnValue("en");
    render(<Probe postId="post-a" testId="a" />);
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("投稿 ID が無ければ false", async () => {
    render(<Probe postId={null} testId="none" />);
    await act(async () => {});
    expect(screen.getByTestId("none").textContent).toBe("plain");
  });

  test("API が失敗しても止まらず、普段の見た目のまま", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    render(<Probe postId="post-a" testId="a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
  });

  test("API が 500 や形の違う値を返しても、普段の見た目のまま", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: "x" }, false));
    const first = render(<Probe postId="post-a" testId="a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
    first.unmount();

    // 次の取り直しで、配列でない値が返ってきたとき
    resetHalloweenTargetsForTest();
    fetchMock.mockImplementationOnce(async () => jsonResponse({ postIds: "post-a" }));
    render(<Probe postId="post-a" testId="a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.getByTestId("a").textContent).toBe("plain");
  });

  test("数分のあいだは取り直さず、3分たってから使われたら取り直す", async () => {
    const first = render(<Probe postId="post-a" testId="a" />);
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe("target"));
    first.unmount();

    // 2分59秒後: 取り直さない
    setNow(AT_START + 3 * 60 * 1000 - 1000);
    const second = render(<Probe postId="post-a" testId="a" />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.unmount();

    // 3分後: 新しく対象になった作品も拾う
    fetchMock.mockImplementation(async () => jsonResponse({ postIds: ["post-a", "post-new"] }));
    setNow(AT_START + 3 * 60 * 1000 + 1000);
    render(<Probe postId="post-new" testId="new" />);
    await waitFor(() => expect(screen.getByTestId("new").textContent).toBe("target"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("⭐サーバーで描くときは期間中でも出さない(ハイドレーションで食い違わないように)", () => {
    const html = renderToString(<Probe postId="post-a" testId="a" />);
    expect(html).toContain("plain");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** @jest-environment jsdom */

/**
 * 「このカタログで生成する」の元になるサマリ取得・フォロー状態取得(2026-10-02 ユーザー指摘:
 * /user-styles のカードからボタンが消えている)。
 *
 * Next.js 16(Cache Components)は、離れたページを捨てずに隠しておき(<Activity>)、
 * 戻ったときにそのまま見せる。隠している間は effect の後片付けが走る。
 * 取得中にページを離れても(=隠れても)、届いた結果を捨ててはいけない。
 * 捨てると、取得済みとして覚えた投稿は二度と問い合わせず、戻ってもボタンが出ない。
 */

import { Activity, act } from "react";
import { render, screen } from "@testing-library/react";
import { useFeedPromptActions } from "@/features/posts/hooks/useFeedPromptActions";
import { useFeedFollowStatus } from "@/features/posts/hooks/useFeedFollowStatus";

function Probe({ postIds }: { postIds: string[] }) {
  const { summaries } = useFeedPromptActions(postIds, true);
  return <div data-testid="count">{Object.keys(summaries).length}</div>;
}

function App({ mode }: { mode: "visible" | "hidden" }) {
  return (
    <Activity mode={mode}>
      <Probe postIds={["post-1"]} />
    </Activity>
  );
}

test("取得中にページが隠れても、届いた結果を捨てず、戻ったときにボタンを出す", async () => {
  let respond: (value: Response) => void = () => {};
  const fetchMock = jest.fn(
    () => new Promise<Response>((resolve) => (respond = resolve))
  );
  global.fetch = fetchMock as unknown as typeof fetch;

  const { rerender } = render(<App mode="visible" />);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // 取得中に別のページへ移る(このページは隠れる)
  rerender(<App mode="hidden" />);

  await act(async () => {
    respond({
      ok: true,
      json: async () => ({
        summaries: { "post-1": { originPostId: "post-1", isAvailable: true } },
        styleLinks: {},
      }),
    } as Response);
  });

  // 戻る
  rerender(<App mode="visible" />);
  await act(async () => {});

  expect(screen.getByTestId("count").textContent).toBe("1");
});

function FollowProbe() {
  const { followStatuses } = useFeedFollowStatus(["author-1"], "viewer-1", true);
  return <div data-testid="follow">{String(followStatuses["author-1"])}</div>;
}

function FollowApp({ mode }: { mode: "visible" | "hidden" }) {
  return (
    <Activity mode={mode}>
      <FollowProbe />
    </Activity>
  );
}

test("フォロー状態も、取得中にページが隠れて戻ったときに失わない", async () => {
  let respond: (value: Response) => void = () => {};
  const fetchMock = jest.fn(
    () => new Promise<Response>((resolve) => (respond = resolve))
  );
  global.fetch = fetchMock as unknown as typeof fetch;

  const { rerender } = render(<FollowApp mode="visible" />);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  rerender(<FollowApp mode="hidden" />);
  await act(async () => {
    respond({
      ok: true,
      json: async () => ({ following: { "author-1": true } }),
    } as Response);
  });
  rerender(<FollowApp mode="visible" />);
  await act(async () => {});

  expect(screen.getByTestId("follow").textContent).toBe("true");
});

/*
  開いた直後の1回目の取得が失敗しても、再読み込みせずにボタンが出るようにする
  (2026-10-02 /user-styles で「開いてすぐだけ出ない・再読み込みで出る」)。
*/
test("サマリの取得が一度失敗しても、少し待って取り直し、ボタンを出す", async () => {
  jest.useFakeTimers();
  try {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          summaries: { "post-1": { originPostId: "post-1", isAvailable: true } },
          styleLinks: {},
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<App mode="visible" />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("count").textContent).toBe("0");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("count").textContent).toBe("1");
  } finally {
    jest.useRealTimers();
  }
});

test("取り直しても取れなければあきらめる(取り直しは2回まで)", async () => {
  jest.useFakeTimers();
  try {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<App mode="visible" />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("count").textContent).toBe("0");
  } finally {
    jest.useRealTimers();
  }
});

/**
 * /user-styles の一覧本体。
 *
 * ここが誤ると (a) ホーム専用のインプレッション指標に混ざる、
 * (b) チップを切り替えても中身が変わらない、
 * (c) 連打で古い結果が新しい一覧を上書きする、のいずれかが起きる。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserStylesFeedClient } from "@/features/user-styles/components/UserStylesFeedClient";
import type { Post } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

/** PostFeedCard は props を記録するだけのスタブに差し替える。 */
const feedCardProps: Record<string, unknown>[] = [];
jest.mock("@/features/posts/components/PostFeedCard", () => ({
  PostFeedCard: (props: Record<string, unknown>) => {
    feedCardProps.push(props);
    return React.createElement(
      "div",
      { "data-testid": "feed-card" },
      String((props.post as { id?: string })?.id)
    );
  },
}));

jest.mock("@/features/posts/hooks/useFeedPromptActions", () => ({
  useFeedPromptActions: () => ({ summaries: {}, styleLinks: {} }),
}));
jest.mock("@/features/posts/hooks/useFeedFollowStatus", () => ({
  useFeedFollowStatus: () => ({ followStatuses: {}, setFollowStatus: jest.fn() }),
}));

jest.mock("@/features/user-styles/components/UserStyleChips", () => ({
  UserStyleChips: ({
    active,
    authors,
    onSelect,
  }: {
    active: string;
    authors: { authorId: string }[];
    onSelect: (chip: string) => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "chips", "data-active": active },
      React.createElement(
        "button",
        { type: "button", onClick: () => onSelect("usage") },
        "usage"
      ),
      ...authors.map((a) =>
        React.createElement(
          "button",
          {
            key: a.authorId,
            type: "button",
            onClick: () => onSelect(`author:${a.authorId}`),
          },
          a.authorId
        )
      )
    ),
}));

function post(id: string): Post {
  return { id, user: { id: `u-${id}` } } as unknown as Post;
}

const AUTHOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** fetch 呼び出しを記録しつつ、URL ごとに応答を返す。 */
function stubFetch(
  handler: (url: string) => { ok: boolean; body?: unknown } | Promise<{ ok: boolean; body?: unknown }>
) {
  const calls: string[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push(url);
    const res = await handler(url);
    return {
      ok: res.ok,
      status: res.ok ? 200 : 500,
      json: async () => res.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  feedCardProps.length = 0;
  jest.clearAllMocks();
});

describe("UserStylesFeedClient", () => {
  test("サーバーが渡した1ページ目をそのまま描く", () => {
    stubFetch(() => ({ ok: true, body: { authors: [] } }));

    render(
      <UserStylesFeedClient
        initialPosts={[post("p1"), post("p2")]}
        initialCursor={null}
        currentUserId={null}
      />
    );

    expect(screen.getAllByTestId("feed-card").map((el) => el.textContent)).toEqual([
      "p1",
      "p2",
    ]);
  });

  /*
    ⭐ インプレッションはホーム専用の指標。ここで記録すると既存の数字の意味が変わる。
  */
  test("インプレッションを記録しない", () => {
    stubFetch(() => ({ ok: true, body: { authors: [] } }));

    render(
      <UserStylesFeedClient
        initialPosts={[post("p1")]}
        initialCursor={null}
        currentUserId={null}
      />
    );

    expect(feedCardProps[0].trackImpressions).toBe(false);
  });

  test("訪問はマウント時に1回だけ送る", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { authors: [] } }));

    render(
      <UserStylesFeedClient
        initialPosts={[]}
        initialCursor={null}
        currentUserId={null}
      />
    );

    await waitFor(() => {
      expect(calls.filter((u) => u.includes("/api/user-styles/events"))).toHaveLength(1);
    });
  });

  test("未ログインなら作者チップを取りに行かない", async () => {
    const calls = stubFetch(() => ({ ok: true, body: {} }));

    render(
      <UserStylesFeedClient
        initialPosts={[]}
        initialCursor={null}
        currentUserId={null}
      />
    );

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls.some((u) => u.includes("/authors"))).toBe(false);
  });

  test("ログイン済みなら作者チップを取りに行く", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { authors: [] } }));

    render(
      <UserStylesFeedClient
        initialPosts={[]}
        initialCursor={null}
        currentUserId="viewer-1"
      />
    );

    await waitFor(() => {
      expect(calls.some((u) => u.includes("/api/user-styles/authors"))).toBe(true);
    });
  });

  describe("チップ切替", () => {
    /*
      ⭐ サーバーから取り直す。クライアント側で配列を絞る方式にはしない
      ── 1ページ目しか持っていない状態で絞ると、2ページ目以降が永久に出てこない。
    */
    test("👑 を押すと sort=usage で取り直す", async () => {
      const calls = stubFetch((url) =>
        url.includes("/api/user-styles?")
          ? { ok: true, body: { posts: [post("u1")], nextCursor: null } }
          : { ok: true, body: { authors: [] } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[post("p1")]}
          initialCursor={null}
          currentUserId={null}
        />
      );
      await userEvent.click(screen.getByText("usage"));

      await waitFor(() => {
        expect(calls.some((u) => u.includes("sort=usage"))).toBe(true);
      });
      await waitFor(() => {
        expect(
          screen.getAllByTestId("feed-card").map((el) => el.textContent)
        ).toEqual(["u1"]);
      });
    });

    test("チップ選択を計測する（作者チップは author にまとめる）", async () => {
      const calls = stubFetch((url) =>
        url.includes("/api/user-styles/authors")
          ? { ok: true, body: { authors: [{ authorId: AUTHOR_ID, nickname: "n", avatarUrl: null, latestPostedAt: "2026-09-18T00:00:00Z" }] } }
          : { ok: true, body: { posts: [], nextCursor: null } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[]}
          initialCursor={null}
          currentUserId="viewer-1"
        />
      );
      await waitFor(() => screen.getByText(AUTHOR_ID));
      await userEvent.click(screen.getByText(AUTHOR_ID));

      await waitFor(() => {
        expect(calls.some((u) => u.includes(`author=${AUTHOR_ID}`))).toBe(true);
      });
      const body = (global.fetch as jest.Mock).mock.calls
        .filter(([url]) => String(url).includes("/events"))
        .map(([, init]) => JSON.parse((init as RequestInit).body as string));
      expect(body).toContainEqual({ eventType: "user_styles_chip", chip: "author" });
    });

    test("同じチップを押し直しても取り直さない", async () => {
      const calls = stubFetch((url) =>
        url.includes("/api/user-styles?")
          ? { ok: true, body: { posts: [], nextCursor: null } }
          : { ok: true, body: { authors: [] } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[]}
          initialCursor={null}
          currentUserId={null}
        />
      );
      await userEvent.click(screen.getByText("usage"));
      await waitFor(() =>
        expect(calls.filter((u) => u.includes("sort=usage"))).toHaveLength(1)
      );
      await userEvent.click(screen.getByText("usage"));

      expect(calls.filter((u) => u.includes("sort=usage"))).toHaveLength(1);
    });
  });

  describe("失敗したとき", () => {
    test("読み込みに失敗したら理由と再試行を出す", async () => {
      stubFetch((url) =>
        url.includes("/api/user-styles?")
          ? { ok: false }
          : { ok: true, body: { authors: [] } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[post("p1")]}
          initialCursor={null}
          currentUserId={null}
        />
      );
      await userEvent.click(screen.getByText("usage"));

      await waitFor(() => {
        expect(screen.getByText("userStyles.loadFailed")).toBeInTheDocument();
      });
      expect(screen.getByText("userStyles.loadMore")).toBeInTheDocument();
    });

    /*
      ⭐ 空状態は「読み込み中でもエラーでもないとき」だけ出す。
      取得中に出すと、チップを押すたびに「ありません」が一瞬ちらつく。
    */
    test("0件なら空状態を出す", () => {
      stubFetch(() => ({ ok: true, body: { authors: [] } }));

      render(
        <UserStylesFeedClient
          initialPosts={[]}
          initialCursor={null}
          currentUserId={null}
        />
      );

      expect(screen.getByText("userStyles.empty")).toBeInTheDocument();
    });
  });
});

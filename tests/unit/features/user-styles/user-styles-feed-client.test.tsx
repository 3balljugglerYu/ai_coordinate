/**
 * /user-styles の一覧本体。
 *
 * ここが誤ると (a) ホーム専用のインプレッション指標に混ざる、
 * (b) チップを切り替えても中身が変わらない、
 * (c) 連打で古い結果が新しい一覧を上書きする、のいずれかが起きる。
 */

import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

// カタログ刷新(段階公開中は運営のみ)の可否。既定は刷新前。
const catalogRevampMock = jest.fn(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => catalogRevampMock(),
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
  catalogRevampMock.mockReturnValue(false);
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

  describe("刷新後_横スワイプでタブを切り替える", () => {
    type Point = { x: number; y: number };

    /** タッチのイベントを投げる(スワイプは touchmove を止めるため addEventListener で受けている)。 */
    function dispatchTouch(
      target: Element,
      type: "touchstart" | "touchmove" | "touchend",
      touches: Point[],
      changed: Point[] = touches
    ) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const toTouchList = (points: Point[]) =>
        points.map((point, index) => ({
          identifier: index,
          clientX: point.x,
          clientY: point.y,
        }));
      Object.defineProperty(event, "touches", { value: toTouchList(touches) });
      Object.defineProperty(event, "changedTouches", {
        value: toTouchList(changed),
      });
      act(() => {
        target.dispatchEvent(event);
      });
    }

    /** 一覧の上で、指を startX から endX まで横に動かして離す。 */
    function swipeList(target: Element, startX: number, endX: number) {
      dispatchTouch(target, "touchstart", [{ x: startX, y: 300 }]);
      for (let i = 1; i <= 6; i += 1) {
        dispatchTouch(target, "touchmove", [
          { x: startX + ((endX - startX) * i) / 6, y: 300 },
        ]);
      }
      dispatchTouch(target, "touchend", [], [{ x: endX, y: 300 }]);
    }

    /** 選択中のタブの一覧(払っている間に横に見せる隣のタブの見本は含めない)。 */
    function currentList() {
      return within(screen.getByTestId("catalog-swipe-current"));
    }

    function currentCards() {
      return currentList()
        .queryAllByTestId("feed-card")
        .map((el) => el.textContent);
    }

    test("刷新前は横スワイプの領域で包まず、隣のタブも先に取らない", async () => {
      const calls = stubFetch(() => ({ ok: true, body: { authors: [] } }));

      render(
        <UserStylesFeedClient
          initialPosts={[post("p1")]}
          initialCursor={null}
          currentUserId={null}
        />
      );

      expect(screen.queryByTestId("catalog-swipe-panel")).toBeNull();
      await waitFor(() => expect(calls.length).toBeGreaterThan(0));
      expect(calls.some((u) => u.includes("sort=usage"))).toBe(false);
    });

    test("隣のタブ(💖)の1ページ目を先に取り、払うと取り直さずにすぐ出す", async () => {
      catalogRevampMock.mockReturnValue(true);
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
      // 開いた時点で、隣のタブ(💖)の1ページ目を取りに行く
      await waitFor(() => {
        expect(calls.filter((u) => u.includes("sort=usage"))).toHaveLength(1);
      });

      swipeList(currentList().getByTestId("feed-card"), 300, 120);

      expect(screen.getByTestId("chips").getAttribute("data-active")).toBe("usage");
      // 待たずに(骨組みを出さずに)先に取った一覧を出し、取り直さない
      expect(currentCards()).toEqual(["u1"]);
      expect(screen.queryByTestId("user-styles-feed-cards-skeleton")).toBeNull();
      expect(calls.filter((u) => u.includes("sort=usage"))).toHaveLength(1);

      // 戻るときも、離れたタブの一覧を覚えているので取り直さない
      swipeList(currentList().getByTestId("feed-card"), 120, 300);

      expect(screen.getByTestId("chips").getAttribute("data-active")).toBe("all");
      expect(currentCards()).toEqual(["p1"]);
      expect(calls.filter((u) => u.includes("/api/user-styles?"))).toHaveLength(1);
    });

    test("払い始めると、先に取った隣のタブの一覧の先頭を横に見せる", async () => {
      catalogRevampMock.mockReturnValue(true);
      const calls = stubFetch((url) =>
        url.includes("/api/user-styles?")
          ? { ok: true, body: { posts: [post("u1"), post("u2"), post("u3")], nextCursor: null } }
          : { ok: true, body: { authors: [] } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[post("p1")]}
          initialCursor={null}
          currentUserId={null}
        />
      );
      await waitFor(() => {
        expect(calls.some((u) => u.includes("sort=usage"))).toBe(true);
      });
      await waitFor(() => expect(feedCardProps.length).toBeGreaterThan(0));

      dispatchTouch(currentList().getByTestId("feed-card"), "touchstart", [
        { x: 300, y: 300 },
      ]);

      const next = screen.getByTestId("catalog-swipe-peek-next");
      // 先頭の2件だけ(画面の高さの分)。操作はできない見本
      expect(
        within(next)
          .getAllByTestId("feed-card")
          .map((el) => el.textContent)
      ).toEqual(["u1", "u2"]);
      expect(next.hasAttribute("inert")).toBe(true);
      // 見本は画面の外に置くので、画像もアイコンもすぐ読み込む
      const peekCardProps = feedCardProps
        .filter((props) => ["u1", "u2"].includes((props.post as { id?: string }).id ?? ""))
        .slice(-2);
      expect(peekCardProps).toHaveLength(2);
      for (const props of peekCardProps) {
        expect(props.prioritizeImage).toBe(true);
        expect(props.eagerAvatar).toBe(true);
      }
      // 今の一覧のカードは、これまでどおり画面に近づいてから読む
      const currentCardProps = feedCardProps.filter(
        (props) => (props.post as { id?: string }).id === "p1"
      );
      expect(currentCardProps[currentCardProps.length - 1].eagerAvatar).toBe(false);
    });

    test("先に取れていなければ、取り直している間は骨組みを出す", async () => {
      catalogRevampMock.mockReturnValue(true);
      let resolvePage: (value: { ok: boolean; body?: unknown }) => void = () => {};
      const calls = stubFetch((url) =>
        url.includes("/api/user-styles?")
          ? new Promise((resolve) => {
              resolvePage = resolve;
            })
          : { ok: true, body: { authors: [] } }
      );

      render(
        <UserStylesFeedClient
          initialPosts={[post("p1")]}
          initialCursor={null}
          currentUserId={null}
        />
      );
      swipeList(currentList().getByTestId("feed-card"), 300, 120);

      expect(screen.getByTestId("chips").getAttribute("data-active")).toBe("usage");
      await waitFor(() => {
        expect(calls.filter((u) => u.includes("sort=usage")).length).toBeGreaterThan(0);
      });
      expect(currentList().getByTestId("user-styles-feed-cards-skeleton")).toBeTruthy();

      await act(async () => {
        resolvePage({ ok: true, body: { posts: [post("u1")], nextCursor: null } });
      });

      await waitFor(() => {
        expect(currentCards()).toEqual(["u1"]);
      });
      expect(currentList().queryByTestId("user-styles-feed-cards-skeleton")).toBeNull();
    });

    test("先頭のタブで右へ払っても切り替えず、取り直さない", async () => {
      catalogRevampMock.mockReturnValue(true);
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
      await waitFor(() => {
        expect(calls.some((u) => u.includes("sort=usage"))).toBe(true);
      });
      const before = calls.length;

      swipeList(currentList().getByTestId("feed-card"), 120, 300);

      expect(screen.getByTestId("chips").getAttribute("data-active")).toBe("all");
      expect(calls.slice(before).some((u) => u.includes("/api/user-styles?"))).toBe(false);
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

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { PostList } from "@/features/posts/components/PostList";
import {
  consumePendingHomePostRefresh,
  HOME_POST_REFRESH_EVENT,
  type PendingHomePostRefresh,
} from "@/features/posts/lib/home-post-refresh";
import {
  trackHomeViewed,
  trackViewModeChanged,
} from "@/features/posts/lib/home-view-events";
import type { Post } from "@/features/posts/types";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("react-intersection-observer", () => ({
  useInView: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: jest.fn(),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("react-masonry-css", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="masonry">{children}</div>
  ),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

jest.mock("@/features/posts/components/SortTabs", () => ({
  SortTabs: ({ value }: { value: string }) => <div data-testid="sort-tabs">{value}</div>,
}));

jest.mock("@/features/posts/components/PostListSkeleton", () => ({
  PostListSkeleton: () => <div data-testid="post-list-skeleton">loading</div>,
}));

jest.mock("@/features/posts/components/PostListLoadMoreSkeleton", () => ({
  PostListLoadMoreSkeleton: () => <div data-testid="post-list-load-more-skeleton">loading-more</div>,
}));

jest.mock("@/features/posts/components/PostCard", () => ({
  PostCard: ({
    post,
    isHighlighted,
  }: {
    post: Post;
    isHighlighted?: boolean;
  }) => (
    <div
      data-testid={`post-card-${post.id}`}
      data-highlighted={String(Boolean(isHighlighted))}
    >
      {post.caption}
    </div>
  ),
}));

jest.mock("@/features/posts/components/PostFeedCard", () => ({
  PostFeedCard: ({ post }: { post: Post }) => (
    <div data-testid={`post-feed-card-${post.id}`}>{post.caption}</div>
  ),
}));

// 計測は best-effort の副作用。ここでは呼ばれたことだけを見る
jest.mock("@/features/posts/lib/home-view-events", () => ({
  trackHomeViewed: jest.fn(),
  trackViewModeChanged: jest.fn(),
}));

jest.mock("@/features/posts/lib/home-post-refresh", () => ({
  consumePendingHomePostRefresh: jest.fn(),
  HOME_POST_REFRESH_EVENT: "persta:home-post-refresh",
}));

const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;
const useSearchParamsMock = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useInViewMock = useInView as jest.MockedFunction<typeof useInView>;
const useToastMock = useToast as jest.MockedFunction<typeof useToast>;
const createClientMock = createClient as jest.MockedFunction<typeof createClient>;
const consumePendingHomePostRefreshMock =
  consumePendingHomePostRefresh as jest.MockedFunction<
    typeof consumePendingHomePostRefresh
  >;

const postTranslations = {
  postSuccess: "投稿しました",
  dailyBonusTitle: "特典獲得！",
  dailyBonusDescription: ({ amount }: { amount: number }) =>
    `今日の投稿で${amount}ペルコインを獲得しました！`,
  dailyBonusMultiplierBadge: ({ multiplier }: { multiplier: string }) =>
    `${multiplier}x 適用中`,
  noMatch: ({ query }: { query: string }) => `"${query}"に一致する投稿が見つかりませんでした`,
  noFollowingPosts: "フォローしているユーザーの投稿がありません",
  preparing: "準備中...",
  emptyState: "まだ投稿がありません。最初の投稿をしてみましょう！",
  allShown: "全ての投稿を表示しました",
  viewModeGrid: "グリッド表示",
  viewModeFeed: "フィード表示",
  viewModeNewBadge: "NEW",
} as const;

const translationFns = {
  posts: ((key: keyof typeof postTranslations, values?: Record<string, unknown>) => {
    const entry = postTranslations[key];
    return typeof entry === "function" ? entry(values as never) : entry;
  }) as unknown as ReturnType<typeof useTranslations>,
};

function createSearchParamsMock(getQuery: () => string | null) {
  return {
    get: (key: string) => {
      if (key === "q") {
        return getQuery();
      }
      return null;
    },
    toString: () => {
      const query = getQuery();
      return query ? `q=${encodeURIComponent(query)}` : "";
    },
  } as unknown as ReturnType<typeof useSearchParams>;
}

function createPost(id: string, caption: string): Post {
  return {
    id,
    caption,
    created_at: "2026-03-16T00:00:00.000Z",
    is_posted: true,
    posted_at: "2026-03-16T00:00:00.000Z",
    prompt: "prompt",
    user_id: "user-1",
    storage_path: "images/test.png",
  };
}

describe("PostList", () => {
  let fetchMock: jest.Mock;
  let toastMock: jest.Mock;
  let currentQuery: string | null;
  let currentSearchParams: ReturnType<typeof useSearchParams>;
  let pendingPayload: PendingHomePostRefresh | null;
  let initialPosts: Post[];

  beforeEach(() => {
    jest.clearAllMocks();

    fetchMock = jest.fn();
    toastMock = jest.fn();
    currentQuery = null;
    currentSearchParams = createSearchParamsMock(() => currentQuery);
    pendingPayload = null;
    initialPosts = [createPost("initial-1", "initial post")];

    global.fetch = fetchMock as unknown as typeof fetch;

    useRouterMock.mockReturnValue({
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    usePathnameMock.mockReturnValue("/");
    useSearchParamsMock.mockImplementation(() => currentSearchParams);
    useTranslationsMock.mockImplementation((namespace?: string) => {
      if (namespace === "posts") {
        return translationFns.posts;
      }
      throw new Error(`Unexpected namespace: ${namespace}`);
    });
    useInViewMock.mockReturnValue({
      ref: jest.fn(),
      inView: false,
    });
    useToastMock.mockReturnValue({
      toast: toastMock,
    });
    createClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
      },
    } as unknown as ReturnType<typeof createClient>);
    consumePendingHomePostRefreshMock.mockImplementation(() => pendingPayload);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("postedペイロードがある場合_初回だけno-storeで再取得して成功トーストとハイライトを表示する", async () => {
    pendingPayload = {
      action: "posted",
      postId: "post-1",
      bonusGranted: 20,
      bonusMultiplier: 1.3,
      subscriptionPlan: "standard",
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        posts: [createPost("post-1", "fresh post")],
        hasMore: false,
      }),
    });

    render(
      <PostList
        initialPosts={initialPosts}
        skipInitialFetch
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/posts?limit=20&offset=0&sort=newest", {
        cache: "no-store",
      });
    });
    await screen.findByTestId("post-card-post-1");

    expect(toastMock).toHaveBeenCalledTimes(1);
    const toastArg = toastMock.mock.calls[0][0] as {
      title: string;
      description: React.ReactNode;
    };
    expect(toastArg.title).toBe("特典獲得！");
    render(<>{toastArg.description}</>);
    expect(
      screen.getByText("今日の投稿で20ペルコインを獲得しました！")
    ).toBeInTheDocument();
    expect(screen.getByText("1.3x 適用中")).toBeInTheDocument();
    expect(screen.getByTestId("post-card-post-1")).toHaveAttribute(
      "data-highlighted",
      "true"
    );
  });

  test("unpostedペイロードがある場合_初回だけno-storeで再取得しトーストは表示しない", async () => {
    pendingPayload = {
      action: "unposted",
      postId: "post-2",
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        posts: [createPost("post-3", "remaining post")],
        hasMore: false,
      }),
    });

    render(
      <PostList
        initialPosts={initialPosts}
        skipInitialFetch
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/posts?limit=20&offset=0&sort=newest", {
        cache: "no-store",
      });
    });
    await screen.findByTestId("post-card-post-3");

    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("post-card-post-3")).toHaveAttribute(
      "data-highlighted",
      "false"
    );
  });

  test("ホームがマウント済みの場合_投稿更新イベントでno-store再取得する", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        posts: [createPost("post-4", "event refreshed post")],
        hasMore: false,
      }),
    });

    render(
      <PostList
        initialPosts={initialPosts}
        skipInitialFetch
      />
    );

    expect(screen.getByTestId("post-card-initial-1")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    pendingPayload = {
      action: "posted",
      postId: "post-4",
    };

    act(() => {
      window.dispatchEvent(new Event(HOME_POST_REFRESH_EVENT));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/posts?limit=20&offset=0&sort=newest", {
        cache: "no-store",
      });
    });
    await screen.findByTestId("post-card-post-4");
  });

  describe("表示形式のトグル", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    test("既定はグリッド_Masonryで描画しNEWバッジを出す", async () => {
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("masonry")).toBeInTheDocument();
      expect(screen.getByLabelText("グリッド表示")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    test("フィードに切り替えるとMasonryを使わず端末に記憶しNEWバッジが消える", async () => {
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("masonry");

      fireEvent.click(screen.getByLabelText("フィード表示"));

      expect(screen.queryByTestId("masonry")).not.toBeInTheDocument();
      // 1列ではフィード用カードに差し替わる(グリッドの PostCard は使わない)
      expect(screen.getByTestId("post-feed-card-initial-1")).toBeInTheDocument();
      expect(screen.queryByTestId("post-card-initial-1")).not.toBeInTheDocument();
      expect(screen.getByLabelText("フィード表示")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.queryByText("NEW")).not.toBeInTheDocument();
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBe("feed");
    });

    test("記憶済みのフィードは次回訪問時も復元される", async () => {
      window.localStorage.setItem("persta-ai:home-view-mode", "feed");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await waitFor(() => {
        expect(screen.getByLabelText("フィード表示")).toHaveAttribute(
          "aria-pressed",
          "true"
        );
      });
      expect(screen.queryByTestId("masonry")).not.toBeInTheDocument();
      expect(screen.queryByText("NEW")).not.toBeInTheDocument();
    });

    test("表示形式は分母として記録され_切替は遷移元つきで記録される", async () => {
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("masonry");

      expect(trackHomeViewed).toHaveBeenCalledWith("grid");

      fireEvent.click(screen.getByLabelText("フィード表示"));

      expect(trackViewModeChanged).toHaveBeenCalledWith("grid", "feed");
      expect(trackHomeViewed).toHaveBeenCalledWith("feed");
    });

    test("同じ表示形式を押し直しても切替として記録しない", async () => {
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("masonry");

      fireEvent.click(screen.getByLabelText("グリッド表示"));

      expect(trackViewModeChanged).not.toHaveBeenCalled();
    });

    // 検索画面は q 付きでレンダーすると main 由来の初回ロード無限ループを踏むため、
    // 検索クエリ無し(キャッシュ済み投稿を再利用する経路)で表示形式だけを検証する
    test("検索画面ではトグルを出さず_記憶がフィードでもグリッドのまま", async () => {
      usePathnameMock.mockReturnValue("/search");
      window.localStorage.setItem("persta-ai:home-view-mode", "feed");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-initial-1");
      expect(screen.queryByLabelText("フィード表示")).not.toBeInTheDocument();
      expect(screen.getByTestId("masonry")).toBeInTheDocument();
    });
  });
});

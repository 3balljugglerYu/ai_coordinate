import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { PostList } from "@/features/posts/components/PostList";
import {
  consumePendingHomePostRefresh,
  type PendingHomePostRefresh,
} from "@/features/posts/lib/home-post-refresh";
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

jest.mock("@/features/posts/lib/home-post-refresh", () => ({
  consumePendingHomePostRefresh: jest.fn(),
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
  dailyBonusDescription: ({ amount }: { amount: number }) =>
    `今日の投稿で${amount}ペルコインを獲得しました！`,
  noMatch: ({ query }: { query: string }) => `"${query}"に一致する投稿が見つかりませんでした`,
  noFollowingPosts: "フォローしているユーザーの投稿がありません",
  preparing: "準備中...",
  emptyState: "まだ投稿がありません。最初の投稿をしてみましょう！",
  allShown: "全ての投稿を表示しました",
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
      bonusGranted: 50,
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

    expect(toastMock).toHaveBeenCalledWith({
      title: "投稿しました",
      description: "今日の投稿で50ペルコインを獲得しました！",
    });
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
});

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
import {
  clearHomeFeedRestoreSnapshot,
  saveHomeFeedRestoreSnapshot,
} from "@/features/posts/lib/home-feed-restore";
import {
  markForcedFeedView,
  markHomeViewSwitchNoticeSeen,
  setHomeViewMode,
} from "@/features/posts/lib/home-view-preference";
import type { Post } from "@/features/posts/types";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
  useLocale: () => "ja",
}));

const useInViewOptions: { rootMargin?: string }[] = [];
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
    if (entry === undefined) {
      // 未定義のキーはキー名をそのまま返す(文言そのものではなく
      // 「どのキーが出たか」を検証したいテストがあるため)
      return key;
    }
    return typeof entry === "function" ? entry(values as never) : entry;
  }) as unknown as ReturnType<typeof useTranslations>,
};

function createSearchParamsMock(
  getQuery: () => string | null,
  getSort: () => string | null = () => null
) {
  return {
    get: (key: string) => {
      if (key === "q") {
        return getQuery();
      }
      if (key === "sort") {
        return getSort();
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
  let currentSort: string | null;
  let currentSearchParams: ReturnType<typeof useSearchParams>;
  let pendingPayload: PendingHomePostRefresh | null;
  let initialPosts: Post[];

  beforeEach(() => {
    jest.clearAllMocks();

    fetchMock = jest.fn();
    toastMock = jest.fn();
    currentQuery = null;
    currentSort = null;
    currentSearchParams = createSearchParamsMock(
      () => currentQuery,
      () => currentSort
    );
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
    useInViewOptions.length = 0;
    useInViewMock.mockImplementation((options?: { rootMargin?: string }) => {
      useInViewOptions.push(options ?? {});
      return { ref: jest.fn(), inView: false } as ReturnType<typeof useInView>;
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
    /*
      既定をフィードへ変えたのに加え、案内が未表示の端末は保存値を無視して
      1回だけフィードへ強制切替する。既存テストはグリッド前提で書かれているので、
      「案内済み・グリッド保存済み」の状態に揃える。
      強制切替そのものは専用のテストで確かめる。
    */
    markHomeViewSwitchNoticeSeen();
    markForcedFeedView();
    setHomeViewMode("grid");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * ⭐ 完了の合図(トースト・付与モーダル)は、もうここでは出さない。
   *
   * 投稿しても画面が動かなくなったので、投稿したその場で
   * `PostProgressHost` が出す。ここに残すと、あとでホームを開いたときに
   * **もう一度**出てしまう(sessionStorage は遷移しなくても残るため)。
   *
   * ここが受け持つのは新着の同期(no-store の再取得とハイライト)だけ。
   * 付与モーダルの中身は post-progress-host.test.tsx で見ている。
   */
  test("⭐postedペイロードがある場合_再取得とハイライトだけ行い、合図は出さない", async () => {
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

    expect(screen.getByTestId("post-card-post-1")).toHaveAttribute(
      "data-highlighted",
      "true"
    );
    // ⭐ ここが本題。二重に知らせない
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.queryByText("postBonusTitle")).not.toBeInTheDocument();
  });

  /**
   * ⭐ 検索クエリありで**リクエストを投げ続けない**こと。
   *
   * 初回ロードの effect が `initialPostsForWeek` を依存に持っていた。
   * 既定値を `= []` と書いていたため**レンダーのたびに新しい配列**になり、
   * 依存が毎回変わる → effect 再実行 → setState → 再レンダー → …と止まらない。
   * 検索画面は `initialPostsForWeek` を渡さないので常に既定値に落ち、
   * 検索クエリありでだけ発症していた(実測 20秒で8,810回。Vercel が 503 を返し
   * 画面はスケルトンのまま固まる)。これが検索を止めていた原因(PR #466)。
   *
   * 既定値は使い回しの定数にすること。`= []` に戻すと再発する。
   */
  test("⭐検索クエリがあっても取得は1回きり（無限ループしない）", async () => {
    currentQuery = "星";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [createPost("post-1", "星空")], hasMore: false }),
    });

    /*
      注意: 壊れているときの落ち方は**きれいではない**。
      これはレンダーのループなので、fetch 側で打ち切っても React は回り続け、
      テストはハングするか Node ごとメモリ不足で落ちる(実測 exit=134)。
      きれいな assertion にはならないが、再発すれば CI は必ず赤くなる。
    */
    let postsCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).startsWith("/api/posts?")) {
        postsCalls += 1;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          posts: [createPost("post-1", "星空")],
          hasMore: false,
        }),
      });
    });

    render(<PostList initialPosts={initialPosts} skipInitialFetch />);

    await screen.findByTestId("post-card-post-1");

    // 再レンダーが走っても増えないこと
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(postsCalls).toBe(1);
  });

  /**
   * 「いま一覧に出ているのはどの条件で取ったものか」の控えは、
   * newest / week / 未ログインのフォロータブでそれぞれ別に書き換わる。
   * 依存配列を触った変更なので、分岐ごとに壊れていないことを見ておく。
   */
  describe("タブごとの初回ロード", () => {
    test("週間タブは渡された週間ぶんを使い、取りに行かない", async () => {
      currentSort = "week";
      const weekPosts = [createPost("week-1", "今週の投稿")];

      render(
        <PostList
          initialPosts={initialPosts}
          initialPostsForWeek={weekPosts}
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-week-1");

      // 渡されているので API を叩かない
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/posts?")
        )
      ).toHaveLength(0);
      // newest ぶんは出さない
      expect(
        screen.queryByTestId("post-card-initial-1")
      ).not.toBeInTheDocument();
    });

    test("週間ぶんが渡されていなければ取りに行く", async () => {
      currentSort = "week";
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          posts: [createPost("week-2", "取得した週間")],
          hasMore: false,
        }),
      });

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-week-2");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/posts?limit=20&offset=0&sort=week",
        expect.anything()
      );
    });

    /**
     * ⭐ 未ログインのフォロータブは、一覧を空にしてログインを促す。
     * ここで控えを消しておかないと、ログイン後にタブを戻ったときに
     * 「もう取得済み」と誤判定して空のままになる。
     */
    test("⭐未ログインのフォロータブは一覧を空にして取りに行かない", async () => {
      currentSort = "following";

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await waitFor(() =>
        expect(
          screen.queryByTestId("post-card-initial-1")
        ).not.toBeInTheDocument()
      );
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/posts?")
        )
      ).toHaveLength(0);
    });
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
    // 初期描画は既定(フィード)なので prompt-actions は飛ぶ。
    // ここで見たいのは「投稿一覧を取り直していない」こと
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/posts?"))
    ).toHaveLength(0);

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
      markHomeViewSwitchNoticeSeen();
      markForcedFeedView();
      // 既定はフィードになったが、以下のテストはグリッド始点を前提にしている。
      // 既定そのものは専用のテストで確かめる
      setHomeViewMode("grid");
    });

    test("上書き済みで保存がグリッドならグリッドのまま", async () => {
      setHomeViewMode("grid");
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("masonry")).toBeInTheDocument();
      expect(screen.getByLabelText("グリッド表示")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      // NEW バッジは役目を終えた(既定がフィードになったため)
      expect(screen.queryByText("NEW")).not.toBeInTheDocument();
    });

    test("保存が無い端末は上書きせず_案内も出さない(新規・未ログイン)", async () => {
      /*
        既定が feed になった時点でフィードで開くので、上書きの必要が無い。
        ここを分けないと初めて来た人にも「表示が新しくなりました」が出て、
        チュートリアル開始モーダルとも重なる。
      */
      window.localStorage.clear();

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-feed-card-initial-1");
      // 強制切替をしていないので、表示形式は保存しない
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBeNull();
      // ただし「移行処理は済ませた」ことは記録する。
      // ここを記録しないと、あとからグリッドを選んだ瞬間に対象になってしまう
      expect(
        window.localStorage.getItem("persta-ai:home-view-forced-feed-v1")
      ).toBe("1");
    });

    test("新規ユーザーが後からグリッドを選んでも_奪われない", async () => {
      window.localStorage.clear();
      const { unmount } = render(
        <PostList initialPosts={initialPosts} skipInitialFetch />
      );
      await screen.findByTestId("post-feed-card-initial-1");
      unmount();

      // 「グリッドの方が好き」と自分で選んだ
      setHomeViewMode("grid");
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("masonry")).toBeInTheDocument();
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBe("grid");
    });

    test("グリッドを選んでいた端末は_一度だけフィードに切り替える", async () => {
      /*
        既定値を変えるだけでは、過去にトグルを押した端末は保存値が優先されて
        変わらない。まさに関心のある層(自分でグリッドを選んだ人)が
        母数から抜けるため、1回だけ上書きする。
      */
      window.localStorage.clear();
      setHomeViewMode("grid");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-feed-card-initial-1");
      expect(screen.queryByTestId("masonry")).not.toBeInTheDocument();
      // 上書きは保存にも反映する(次回以降はフィードで開く)
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBe("feed");
      // 強制切替は案内とは別に記録する
      expect(
        window.localStorage.getItem("persta-ai:home-view-forced-feed-v1")
      ).toBe("1");
    });

    test("一度上書きした端末は_自分でグリッドに戻しても再上書きしない", async () => {
      /*
        案内は他のモーダルが開いていると出せず次回へ持ち越す。案内フラグだけで
        判定していると、出せなかった端末では毎回上書きされ、
        グリッドに戻しても訪れるたびに奪われる。
      */
      window.localStorage.clear();
      setHomeViewMode("grid");
      const { unmount } = render(
        <PostList initialPosts={initialPosts} skipInitialFetch />
      );
      await screen.findByTestId("post-feed-card-initial-1");
      unmount();

      // ユーザーが自分でグリッドに戻した状態を作る
      setHomeViewMode("grid");
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("masonry")).toBeInTheDocument();
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBe("grid");
    });

    test("強制切替は自発的な切替として記録しない", async () => {
      /*
        view_mode_changed は「自分で選んだ」記録として使う。運営都合の切替を
        混ぜると全員が1回 grid→feed した形になり、
        「戻した人の割合」が算出できなくなる(ADR-004)。
      */
      window.localStorage.clear();
      setHomeViewMode("grid");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("post-feed-card-initial-1");

      expect(trackViewModeChanged).not.toHaveBeenCalled();
      // 分母は切替後の表示形式で記録する
      expect(trackHomeViewed).toHaveBeenCalledWith("feed");
    });

    test("既定はフィード_Masonryを使わずフィード用カードで描画する", async () => {
      window.localStorage.removeItem("persta-ai:home-view-mode");
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("post-feed-card-initial-1")).toBeInTheDocument();
      expect(screen.queryByTestId("masonry")).not.toBeInTheDocument();
      expect(screen.getByLabelText("フィード表示")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.queryByText("NEW")).not.toBeInTheDocument();
    });

    test("グリッドへ戻すとMasonryに戻り端末に記憶する", async () => {
      window.localStorage.removeItem("persta-ai:home-view-mode");
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("post-feed-card-initial-1");

      fireEvent.click(screen.getByLabelText("グリッド表示"));

      expect(screen.getByTestId("masonry")).toBeInTheDocument();
      expect(screen.queryByTestId("post-feed-card-initial-1")).not.toBeInTheDocument();
      expect(window.localStorage.getItem("persta-ai:home-view-mode")).toBe("grid");
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

    test("無限スクロールの先読み距離は表示形式で変える", async () => {
      /*
        フィードは1列でカードが縦に大きく、グリッドと同じ距離では
        「下まで行ってから待たされる」体感になる。カード3枚ぶん手前で取りに行く。
      */
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);
      await screen.findByTestId("masonry");

      const gridMargin = useInViewOptions[useInViewOptions.length - 1].rootMargin;
      expect(gridMargin).toBe("500px");

      fireEvent.click(screen.getByLabelText("フィード表示"));

      const feedMargin = useInViewOptions[useInViewOptions.length - 1].rootMargin;
      // jsdom の innerWidth は 1024 なのでカード幅は上限 600px
      // (600 + 170) * 3 = 2310px
      expect(feedMargin).toBe("2310px");
      expect(Number.parseInt(feedMargin!, 10)).toBeGreaterThan(
        Number.parseInt(gridMargin!, 10)
      );
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

  describe("詳細から戻ったときの復元", () => {
    /** 追加読み込み済み(21件以上)の一覧を保存した状態を作る。 */
    function saveRestorableSnapshot(sortType: "newest" | "popular" = "newest") {
      saveHomeFeedRestoreSnapshot({
        posts: Array.from({ length: 25 }, (_, i) =>
          createPost(`restored-${i}`, `restored ${i}`)
        ),
        offset: 25,
        hasMore: true,
        sortType,
        viewMode: "grid",
        searchQuery: "",
        anchorPostId: "restored-20",
        anchorTop: 100,
        scrollY: 4000,
      });
    }

    beforeEach(() => {
      // 直前の describe が表示形式を feed のまま残すため、グリッド前提に戻す
      window.localStorage.clear();
      markHomeViewSwitchNoticeSeen();
      markForcedFeedView();
      // 既定はフィードになったが、以下のテストはグリッド始点を前提にしている。
      // 既定そのものは専用のテストで確かめる
      setHomeViewMode("grid");
    });

    afterEach(() => {
      clearHomeFeedRestoreSnapshot();
    });

    test("保存済みの一覧を_サーバー描画ぶんで上書きしない", async () => {
      /*
        初回ロードの effect が initialPosts で一覧を出し直す経路があり、
        ここを塞がないと復元した25件が1件に潰れる。潰れると高さが足りず、
        基準にするカードごと消えるのでスクロール位置も戻らない
        （実機で最初にこの壊れ方をした）。
      */
      saveRestorableSnapshot();

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-restored-24");
      await act(async () => {});

      expect(screen.getByTestId("post-card-restored-0")).toBeInTheDocument();
      expect(screen.queryByTestId("post-card-initial-1")).not.toBeInTheDocument();
      // 復元できたなら取り直す必要はない
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("並び替えが違う保存は使わない（別の一覧なので）", async () => {
      saveRestorableSnapshot("popular");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-initial-1");
      expect(screen.queryByTestId("post-card-restored-0")).not.toBeInTheDocument();
    });
  });
});

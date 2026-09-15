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
import {
  HOME_SORT_TTL_MS,
  setHomeSortType,
} from "@/features/posts/lib/home-sort-preference";
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

/*
  ⭐ 描画された選択タブを**毎回**記録する。

  最終状態だけを見ていると「一瞬どのタブも選択されていない」を捕まえられない
  (追随の effect が直した後を見てしまう)。名前が mock で始まるものだけが
  jest.mock のファクトリから参照できる。
*/
const mockRenderedSortValues: string[] = [];

jest.mock("@/features/posts/components/SortTabs", () => ({
  SortTabs: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }) => {
    mockRenderedSortValues.push(value);
    return (
      <div data-testid="sort-tabs">
        <span data-testid="sort-tabs-value">{value}</span>
        <button data-testid="sort-tab-newest" onClick={() => onChange("newest")}>
          newest
        </button>
      </div>
    );
  },
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
    /*
      ⭐ spyOn はケースをまたいで残る(このリポジトリの jest 設定に
      restoreMocks は無い)。期限のケースで Date.now を固定するので、
      戻しておかないと以降のケースが凍った時刻で走る。
    */
    jest.restoreAllMocks();

    /*
      ⭐ タブの控えはテストをまたいで残り、前のケースで押したタブが
      復元されてしまう。各ケースは既定タブから始まる前提なので、毎回
      まっさらにする。**2層あるので両方消す**(滞在=sessionStorage /
      訪問=localStorage。片方だけだと訪問の控えが次のケースへ漏れる)。
    */
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockRenderedSortValues.length = 0;

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
   * ここが受け持つのは新着への差し込みだけ。
   * 付与モーダルの中身は post-progress-host.test.tsx で見ている。
   *
   * 緑のハイライトは廃止した。投稿できたかの確認は、投稿したその場で出る
   * トーストの「確認する」(PostProgressHost) が投稿詳細へ連れて行く。
   */
  test("⭐postedペイロードがある場合_差し込むだけで合図は出さない", async () => {
    pendingPayload = {
      action: "posted",
      postId: "post-1",
      bonusGranted: 20,
      bonusMultiplier: 1.3,
      subscriptionPlan: "standard",
      post: createPost("post-1", "fresh post"),
    };

    render(
      <PostList
        initialPosts={initialPosts}
        skipInitialFetch
      />
    );

    await screen.findByTestId("post-card-post-1");
    // 取り直しはしない(投稿のたびにスケルトンで待たせない)
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/posts?")
      )
    ).toHaveLength(0);

    // ⭐ ここが本題。二重に知らせない
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.queryByText("postBonusTitle")).not.toBeInTheDocument();
  });

  /**
   * ⭐ 検索クエリありで**リクエストを投げ続けない**こと。
   *
   * 初回ロードの effect が `initialMiddlePosts` を依存に持っていた。
   * 既定値を `= []` と書いていたため**レンダーのたびに新しい配列**になり、
   * 依存が毎回変わる → effect 再実行 → setState → 再レンダー → …と止まらない。
   * 検索画面は `initialMiddlePosts` を渡さないので常に既定値に落ち、
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

  /*
    ⭐ 投稿したての作品を差し込んでよいのは新着だけ。

    PICK UP は順位テーブル由来で、投稿したての作品はスコア 0 なので
    新着枠(直近24hの上位3件)に入らない限り**本当に載っていない**。
    差し込むと順位を偽ることになり、次に開いたとき消える。

    新着は違う。本人には自分の pending 投稿も出る(server-api の
    buildOwnerVisibleOrFilter)ので、その作品は本当に一覧の一部であり、
    まだ取りに行っていないだけである。
  */
  describe("投稿直後の差し込み", () => {
    const justPosted = { action: "posted", postId: "mine-1" } as const;

    test("⭐PICK UPタブには差し込まない(順位を偽らない)", async () => {
      pendingPayload = {
        ...justPosted,
        post: createPost("mine-1", "投稿したて"),
      };
      const pickupPosts = [createPost("pickup-1", "人気の作品")];

      render(
        <PostList
          initialPosts={pickupPosts}
          initialDefaultSort="popular_prompts"
          initialMiddlePosts={initialPosts}
          initialMiddleSort="newest"
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-pickup-1");
      expect(screen.queryByTestId("post-card-mine-1")).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/posts?")
        )
      ).toHaveLength(0);
    });

    /*
      ⭐ ユーザーが報告した症状の回帰ガード。

      既定が PICK UP の人にとって新着は「中間タブ」。以前は取り直しの条件が
      **既定タブかどうか**で書かれていたため、新着を見ていても投稿が反映されず、
      画面を更新するまで自分の投稿が出てこなかった。
    */
    test("⭐新着が中間タブ(既定がPICK UP)でも差し込む", async () => {
      setHomeSortType("newest");
      pendingPayload = {
        ...justPosted,
        post: createPost("mine-1", "投稿したて"),
      };

      render(
        <PostList
          initialPosts={[createPost("pickup-1", "人気の作品")]}
          initialDefaultSort="popular_prompts"
          initialMiddlePosts={initialPosts}
          initialMiddleSort="newest"
          skipInitialFetch
        />
      );

      expect(await screen.findByTestId("post-card-mine-1")).toBeInTheDocument();
      expect(screen.getByTestId("post-card-initial-1")).toBeInTheDocument();
    });

    /*
      ⭐ サーバーのキャッシュが失効していれば、投稿は最初から一覧に入っている。
      重ねると同じ作品が2枚並び、`key` も重複する。
    */
    test("⭐既に一覧に入っていれば重ねない", async () => {
      pendingPayload = {
        ...justPosted,
        post: createPost("mine-1", "投稿したて"),
      };

      render(
        <PostList
          initialPosts={[createPost("mine-1", "投稿したて"), ...initialPosts]}
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-initial-1");
      expect(screen.getAllByTestId("post-card-mine-1")).toHaveLength(1);
    });

    test("カードが取れなかったときは何も差し込まない", async () => {
      pendingPayload = { ...justPosted, post: null };

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-initial-1");
      expect(screen.queryByTestId("post-card-mine-1")).not.toBeInTheDocument();
    });
  });

  /*
    ⭐ 既定が新着の人でも取り直さない。

    以前はここで一覧を丸ごと取り直していたので、**投稿するたびに
    スケルトンで待たされていた**。差し込みで先に見せる。
  */
  test("既定が新着でも_投稿直後は取り直さず差し込む", async () => {
    pendingPayload = {
      action: "posted",
      postId: "post-1",
      post: createPost("post-1", "fresh post"),
    };

    render(<PostList initialPosts={initialPosts} skipInitialFetch />);

    await screen.findByTestId("post-card-post-1");
    expect(screen.getByTestId("post-card-initial-1")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/posts?")
      )
    ).toHaveLength(0);
  });

  /**
   * ⭐ 追加ページに 1 ページ目と同じ投稿が混ざっても、二重に並べないこと。
   *
   * 1 ページ目はサーバーが用意した配列（`"use cache"` の写し）で、
   * 2 ページ目以降はスクロール時の API 取得である。その間に順位や並びが動くと
   * 境界をまたいだ投稿が両方に入る。人気タブなら cron の洗い替えで
   * 20 位が 21 位へ下がったとき、新着タブなら追加取得までに新規投稿があったとき。
   *
   * 素で連結していたころは同じカードが 2 枚並び、`key={post.id}` も重複していた。
   */
  describe("追加ページの重複", () => {
    async function loadSecondPage(secondPage: Post[]) {
      // 1 ページ目はサーバー配列（20 件 = hasMore の条件を満たす）
      const firstPage = Array.from({ length: 20 }, (_, i) =>
        createPost(`p${i + 1}`, `投稿${i + 1}`)
      );
      fetchMock.mockImplementation((url: string) => {
        if (String(url).startsWith("/api/posts?")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ posts: secondPage, hasMore: false }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // 追加取得のトリガー（無限スクロールの監視要素が画面に入った状態）
      useInViewMock.mockImplementation((options?: { rootMargin?: string }) => {
        useInViewOptions.push(options ?? {});
        return { ref: jest.fn(), inView: true } as ReturnType<typeof useInView>;
      });

      render(<PostList initialPosts={firstPage} skipInitialFetch />);
      await screen.findByTestId("post-card-p1");
      return firstPage;
    }

    test("⭐1ページ目と重なる投稿は2枚並べない", async () => {
      // p20 が押し下げられ、2 ページ目の先頭に再登場したケース
      await loadSecondPage([
        createPost("p20", "投稿20"),
        createPost("p21", "投稿21"),
      ]);

      await screen.findByTestId("post-card-p21");
      expect(screen.getAllByTestId("post-card-p20")).toHaveLength(1);
    });

    test("重ならない投稿は落とさない", async () => {
      await loadSecondPage([
        createPost("p21", "投稿21"),
        createPost("p22", "投稿22"),
      ]);

      await screen.findByTestId("post-card-p22");
      expect(screen.getByTestId("post-card-p21")).toBeInTheDocument();
      // 1 ページ目も消えない
      expect(screen.getByTestId("post-card-p20")).toBeInTheDocument();
    });
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
          initialMiddlePosts={weekPosts}
          initialMiddleSort="week"
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

    /*
      ⭐ 中間タブは可否によって week / popular_prompts のどちらにもなる。
      プロップ名を week 固定にしていたころは、運営に渡した人気の初期配列が
      そのまま捨てられていた。渡された sort と一致するときだけ再利用する。
    */
    test("人気タブは渡された人気ぶんを使い、取りに行かない", async () => {
      currentSort = "popular_prompts";
      const popularPosts = [createPost("popular-1", "よく使われている")];

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={popularPosts}
          initialMiddleSort="popular_prompts"
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-popular-1");

      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/posts?")
        )
      ).toHaveLength(0);
    });

    test("渡された初期配列と別の中間タブなら再利用せず取りに行く", async () => {
      // 人気ぶんを渡されているのに week を見ている状態。中身が違うので流用してはいけない
      currentSort = "week";
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          posts: [createPost("week-3", "取得した週間")],
          hasMore: false,
        }),
      });

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={[createPost("popular-2", "人気ぶん")]}
          initialMiddleSort="popular_prompts"
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-week-3");
      expect(
        screen.queryByTestId("post-card-popular-2")
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

  /*
    ⭐ 取り消しは**どのタブでも**取り直すこと。

    以前は取り直しの条件が「既定タブかどうか」で書かれていたため、
    新着が中間タブになる人(既定が PICK UP)では取り消した作品が
    サーバー配布の配列に残ったままだった。
  */
  test("⭐取り消しは新着が中間タブでも取り直す", async () => {
    setHomeSortType("newest");
    pendingPayload = { action: "unposted", postId: "gone-1" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [createPost("remaining-1", "残った投稿")],
        hasMore: false,
      }),
    });

    render(
      <PostList
        initialPosts={[createPost("pickup-1", "人気の作品")]}
        initialDefaultSort="popular_prompts"
        initialMiddlePosts={[createPost("gone-1", "取り消した投稿")]}
        initialMiddleSort="newest"
        skipInitialFetch
      />
    );

    await screen.findByTestId("post-card-remaining-1");
    expect(screen.queryByTestId("post-card-gone-1")).not.toBeInTheDocument();
    // ブラウザのキャッシュに残った古い一覧も使わないこと
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/posts?limit=20&offset=0&sort=newest",
      { cache: "no-store" }
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

  /*
    ホームの上にシートを開いたまま投稿した場合。ホームはマウント済みなので、
    合図はイベントで届く。
  */
  test("ホームがマウント済みの場合_投稿更新イベントで差し込む", async () => {
    render(
      <PostList
        initialPosts={initialPosts}
        skipInitialFetch
      />
    );

    expect(screen.getByTestId("post-card-initial-1")).toBeInTheDocument();

    pendingPayload = {
      action: "posted",
      postId: "post-4",
      post: createPost("post-4", "event posted"),
    };

    act(() => {
      window.dispatchEvent(new Event(HOME_POST_REFRESH_EVENT));
    });

    await screen.findByTestId("post-card-post-4");
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/posts?"))
    ).toHaveLength(0);
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
    function saveRestorableSnapshot(
      sortType: "newest" | "popular" | "week" | "following" | "popular_prompts" = "newest"
    ) {
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

    /*
      ⭐ 既定タブ以外(一般ユーザーのオススメ等)でも復元できること。

      復元した一覧が「どのタブのぶんか」を記録していなかったため、初回ロードの
      effect が「このタブはまだ読み込んでいない」と判断し、サーバー配布の20件で
      上書きしていた。基準にしていたカードごと消えるので位置が戻らず、
      「20件を超えたあたりから戻れない」状態になっていた。
    */
    test("⭐既定タブ以外でも復元する(サーバー配布の20件で上書きしない)", async () => {
      setHomeSortType("week");
      saveRestorableSnapshot("week");

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={[createPost("middle-1", "middle post")]}
          initialMiddleSort="week"
          skipInitialFetch
        />
      );

      // 復元した25件が出ること(サーバー配布の initialMiddlePosts で潰れない)
      await screen.findByTestId("post-card-restored-24");
      await act(async () => {});

      expect(screen.getByTestId("post-card-restored-0")).toBeInTheDocument();
      expect(screen.queryByTestId("post-card-middle-1")).not.toBeInTheDocument();
      // 取り直しも走らない(復元した一覧をそのまま使う)
      expect(fetchMock).not.toHaveBeenCalled();
    });

    /*
      ⭐ フォロータブは currentUserId(getUser の非同期解決)に依存する。
      確定前は null なので、待たずに進むとログイン済みでも「未ログイン」と
      誤判定して一覧を空にし、復元ぶんまで捨てていた。
    */
    test("⭐フォロータブでも復元する(認証の確定前に一覧を空にしない)", async () => {
      createClientMock.mockReturnValue({
        auth: {
          getUser: jest
            .fn()
            .mockResolvedValue({ data: { user: { id: "user-1" } } }),
          onAuthStateChange: jest.fn().mockReturnValue({
            data: { subscription: { unsubscribe: jest.fn() } },
          }),
        },
      } as unknown as ReturnType<typeof createClient>);
      setHomeSortType("following");
      saveRestorableSnapshot("following");

      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      await screen.findByTestId("post-card-restored-24");
      await act(async () => {});

      expect(screen.getByTestId("post-card-restored-0")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    /*
      ⭐ 運営だけに見える PICK UP(既定タブ)。サーバーが initialDefaultSort で
      渡すため既定タブ側の経路になるが、復元の判定がタブ非依存になったことを
      ここでも固定しておく。
    */
    test("⭐PICK UPタブ(運営の既定タブ)でも復元する", async () => {
      setHomeSortType("popular_prompts");
      saveRestorableSnapshot("popular_prompts");

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={[createPost("middle-1", "middle post")]}
          initialMiddleSort="newest"
          initialDefaultSort="popular_prompts"
          skipInitialFetch
        />
      );

      await screen.findByTestId("post-card-restored-24");
      await act(async () => {});

      expect(screen.getByTestId("post-card-restored-0")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  /*
    ⭐ 詳細画面から戻ったときのタブ。

    投稿詳細へ行くとページセグメントが作り直され、URL に sort パラメータが
    無いため既定タブ(PICK UP)で上書きされていた。「新着を見ていたのに戻ると
    PICK UP に居る」という迷子を防ぐ回帰ガード。
  */
  describe("タブの復元", () => {
    test("⭐新着を選んでから作り直されても新着タブのまま", async () => {
      const first = render(
        <PostList initialPosts={initialPosts} skipInitialFetch />
      );
      await screen.findByTestId("sort-tabs-value");
      expect(screen.getByTestId("sort-tabs-value")).toHaveTextContent("newest");

      // 既定が新着の状態から PICK UP へ切り替え、そのうえで新着へ戻す
      // (押した結果が控えられることを見る)
      act(() => {
        fireEvent.click(screen.getByTestId("sort-tab-newest"));
      });
      expect(window.sessionStorage.getItem("persta-ai:home-sort-type")).toBe(
        "newest"
      );

      // 詳細へ遷移して戻る = セグメントの作り直し
      first.unmount();
      render(<PostList initialPosts={initialPosts} skipInitialFetch />);

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "newest"
      );
    });

    test("控えが無ければ既定タブから始まる", async () => {
      window.sessionStorage.clear();

      render(
        <PostList
          initialPosts={initialPosts}
          skipInitialFetch
          initialDefaultSort="popular_prompts"
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "popular_prompts"
      );
    });

    test("控えたタブは既定より優先される(戻り先が PICK UP に奪われない)", async () => {
      setHomeSortType("newest");

      render(
        <PostList
          initialPosts={initialPosts}
          skipInitialFetch
          initialDefaultSort="popular_prompts"
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "newest"
      );
    });
  });

  /*
    ⭐ 滞在をまたいだときのタブ(タブを閉じて開き直す / PWA が落ちる)。

    控えが sessionStorage だけだった頃は、ここで必ず既定タブへ戻っていた。
    モバイルではタブや PWA が頻繁に落とされるため、体感は「毎回リセット」に
    近かった。訪問層(localStorage・24時間)を足して前回のタブで開く。
  */
  describe("開き直したときのタブ", () => {
    /** タブを閉じて開き直した状態。滞在層だけが消える。 */
    const reopen = () => window.sessionStorage.clear();

    test("⭐新着で終えたら、次に開いたときも新着", async () => {
      setHomeSortType("newest");
      reopen();

      render(
        <PostList
          initialPosts={initialPosts}
          skipInitialFetch
          initialDefaultSort="popular_prompts"
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "newest"
      );
    });

    /*
      ⭐ フォローのまま離脱しても、次は新着で開くこと。

      フォロー0人なら空の画面で、未ログインなら開いた瞬間にログインモーダルで
      アプリが始まってしまう(控えのほうが認証判定より先に走るため)。
    */
    test("⭐フォローで終えても、次は前に読んでいたタブで開く", async () => {
      setHomeSortType("newest");
      setHomeSortType("following");
      reopen();

      render(
        <PostList
          initialPosts={initialPosts}
          skipInitialFetch
          initialDefaultSort="popular_prompts"
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "newest"
      );
    });

    /*
      ⭐ 期限が無いと既定タブ(PICK UP)が死ぬ。新着は「探しに行くとき」に押す
      タブなので、一度押しただけの人が永久に新着へ固定されてしまう。
    */
    test("⭐24時間を超えていたら既定タブで開く", async () => {
      const savedAt = Date.now();
      setHomeSortType("newest");
      reopen();
      jest
        .spyOn(Date, "now")
        .mockReturnValue(savedAt + HOME_SORT_TTL_MS + 1);

      render(
        <PostList
          initialPosts={initialPosts}
          skipInitialFetch
          initialDefaultSort="popular_prompts"
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "popular_prompts"
      );
    });

    /*
      ⭐ PICK UP が使えるようになった瞬間をまたぐ人。

      控えが訪問をまたぐようになったので、昇格前に選んだ "week" が残っている
      状態で開くことがある。SortTabs からオススメは消えているのに sortType は
      "week" のままになり、**どのタブも選択されていない**状態で描画される。
    */
    test("⭐昇格前のオススメの控えは既定タブへ倒す(無選択にしない)", async () => {
      setHomeSortType("week");
      reopen();

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={[createPost("middle-1", "middle post")]}
          initialMiddleSort="newest"
          initialDefaultSort="popular_prompts"
          skipInitialFetch
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "popular_prompts"
      );
      /*
        ⭐ 最終状態だけでは足りない。追随の effect があるので、倒さなくても
        最後は popular_prompts に落ち着く。**一度も** week で描画しないこと
        (SortTabs から消えているタブなので、その1フレームは無選択になる)。
      */
      expect(mockRenderedSortValues).not.toContain("week");
    });

    test("PICK UP が無ければオススメの控えはそのまま復元する", async () => {
      setHomeSortType("week");
      reopen();

      render(
        <PostList
          initialPosts={initialPosts}
          initialMiddlePosts={[createPost("middle-1", "middle post")]}
          initialMiddleSort="week"
          skipInitialFetch
        />
      );

      expect(await screen.findByTestId("sort-tabs-value")).toHaveTextContent(
        "week"
      );
    });
  });
});

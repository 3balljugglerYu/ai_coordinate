"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { PostFeedCard } from "./PostFeedCard";
import { PostBonusModal } from "./PostBonusModal";
import { PostListSkeleton } from "./PostListSkeleton";
import { PostListLoadMoreSkeleton } from "./PostListLoadMoreSkeleton";
import { SortTabs } from "./SortTabs";
import { usePopularPromptsAvailable } from "./PopularPromptsAvailabilityProvider";
import { HomeViewToggle } from "./HomeViewToggle";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import type { Post, SortType } from "../types";
import { isValidSortType } from "../lib/utils";
import {
  consumePendingHomePostRefresh,
  HOME_POST_REFRESH_EVENT,
  type PendingHomePostRefresh,
} from "../lib/home-post-refresh";
import {
  DEFAULT_HOME_VIEW_MODE,
  getHomeViewMode,
  HOME_VIEW_MODES,
  markHomeFeedNewBadgeSeen,
  setHomeViewMode,
  markForcedFeedView,
  shouldForceFeedView,
  shouldShowHomeViewSwitchNotice,
  type HomeViewMode,
} from "../lib/home-view-preference";
import { HomeViewSwitchNotice } from "./HomeViewSwitchNotice";
import { FEED_CARD_MAX_WIDTH_PX } from "../lib/constants";
import { useFeedFollowStatus } from "../hooks/useFeedFollowStatus";
import { useFeedPromptActions } from "../hooks/useFeedPromptActions";
import { trackHomeViewed, trackViewModeChanged } from "../lib/home-view-events";
import {
  clearHomeFeedRestoreSnapshot,
  peekHomeFeedRestoreSnapshot,
  restoreHomeFeedScroll,
  saveHomeFeedRestoreSnapshot,
} from "../lib/home-feed-restore";

/** グリッドの先読み距離。複数カラムなので1行が低く、数行ぶんの余裕になる。 */
const GRID_PREFETCH_MARGIN_PX = 500;

/**
 * フィードカードの画像以外のおおよその高さ。
 * 作者行 + キャプション + 行動ボタン + 統計 + カード間の余白のぶん。
 * 画像は縦長でも幅までに収まるので、カード高 ≒ カード幅 + この値。
 */
const FEED_CARD_CHROME_PX = 170;

/** フィードで何枚ぶん手前から次を取りに行くか。 */
const FEED_PREFETCH_CARDS = 3;

/**
 * 中間タブ（新着とフォローの間）に入りうる sort。
 *
 * 段階公開のあいだ、ここは閲覧者によって week（オススメ）と
 * popular_prompts（🔥人気）のどちらにもなる。Phase 6 で week を消せば
 * 1 値になり、この型ごと畳める。
 */
export type MiddleSort = "week" | "popular_prompts";

interface PostListProps {
  initialPosts?: Post[];
  /**
   * 中間タブ用のキャッシュ済みデータ（CachedHomePostList から渡す）。
   *
   * ⭐ プロップ名を week 固定にすると、可否によって中間タブが
   * popular_prompts になったときに初期配列が丸ごと捨てられる。
   * どの sort のデータなのかを {@link initialMiddleSort} で併せて受け取る。
   */
  initialMiddlePosts?: Post[];
  /** initialMiddlePosts がどの sort のデータか。既定は既存挙動どおり week。 */
  initialMiddleSort?: MiddleSort;
  forceInitialLoading?: boolean;
  /** 親がデータを提供している場合、初回の loadPosts をスキップ（キャッシュ表示の最適化用） */
  skipInitialFetch?: boolean;
  /** viewable インプレッション計測を有効にする(ホームフィードのみ true) */
  trackImpressions?: boolean;
  /**
   * 他人にプロンプトを使われたときに原作者へ入る額。付与モーダルの案内に使う。
   * 0 なら還元は停止中なので案内を出さない。
   */
  promptUsageRewardAmount?: number;
}

/**
 * 未指定の props に使う空配列。
 *
 * ⭐ **`= []` を既定値に書かないこと。** 既定値の配列リテラルは
 * **レンダーのたびに新しい参照**になる。初回ロードの effect はこれを
 * 依存に持っているので、依存が毎回変わり → effect が再実行 → setState →
 * 再レンダー → また新しい配列…と止まらなくなる。
 *
 * 検索画面(`CachedSearchPostList`)は `initialMiddlePosts` を渡さないため
 * 常に既定値に落ち、**検索クエリありで無限ループしていた**(PR #466 で
 * 検索を止めた原因)。同じ参照を使い回せば依存は変わらない。
 */
const EMPTY_POSTS: Post[] = [];

export function PostList({
  initialPosts = EMPTY_POSTS,
  initialMiddlePosts = EMPTY_POSTS,
  initialMiddleSort = "week",
  forceInitialLoading = false,
  skipInitialFetch = false,
  trackImpressions = false,
  promptUsageRewardAmount = 0,
}: PostListProps) {
  const postsT = useTranslations("posts");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = pathname;
  const searchQuery = searchParams.get("q") || "";
  const normalizedSearchQuery = searchQuery.trim();
  const hasModerationRefresh = searchParams.get("mod_refresh") === "1";
  const isSearchPage = pathname === "/search" || pathname?.endsWith("/search");
  // 検索画面の場合はデフォルトでpopular、それ以外はnewest
  const defaultSortType: SortType = isSearchPage ? "popular" : "newest";

  const [posts, setPosts] = useState<Post[]>(
    forceInitialLoading ? [] : initialPosts
  );
  const [isLoading, setIsLoading] = useState(forceInitialLoading);
  const [hasMore, setHasMore] = useState(
    forceInitialLoading ? true : initialPosts.length === 20
  );
  const [offset, setOffset] = useState(
    forceInitialLoading ? 0 : initialPosts.length
  );
  const popularPromptsAvailable = usePopularPromptsAvailable();
  const [sortType, setSortType] = useState<SortType>(defaultSortType);
  const [prevSortType, setPrevSortType] = useState<SortType>(defaultSortType);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /*
    ⭐ 「いま一覧に出ているのは、どの条件で取ったものか」の控え。

    **state ではなく ref。** 画面には一切描画しておらず、読むのは effect の中だけ。
    state にすると初回ロードの effect の依存に入り、その effect が呼ぶ
    loadPosts がこれらを更新するため、**依存が変わってまた effect が走る**。
    検索クエリがあると早期 return する分岐をどれも通らないので止まらず、
    リクエストを投げ続けて Vercel が 503 を返し、画面はスケルトンのまま固まる
    (これが検索を一時停止していた理由。PR #466)。

    ref なら更新しても再レンダーも再実行も起きないので、ループにならない。
  */
  const loadedSortTypeRef = useRef<SortType | null>(
    forceInitialLoading ? null : defaultSortType
  );
  const loadedSearchQueryRef = useRef<string | null>(
    forceInitialLoading ? null : ""
  );
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  // 投稿ボーナスの付与モーダル。付与があったときだけ開く
  const [postBonus, setPostBonus] = useState<{
    amount: number;
    multiplier?: number;
    generationType: string | null;
    /** 他の人のプロンプトで作った作品の投稿だったか（フリー投稿とは排他） */
    isPromptUse: boolean;
  } | null>(null);
  const [pendingHomePostRefresh, setPendingHomePostRefresh] =
    useState<PendingHomePostRefresh | null>(null);
  // 表示形式は端末に記憶する。SSR とハイドレーション不一致を避けるため、
  // 初期値は既定(フィード)にして、マウント後に localStorage から復元する。
  const [viewMode, setViewMode] = useState<HomeViewMode>(DEFAULT_HOME_VIEW_MODE);
  const [showViewModeNewBadge, setShowViewModeNewBadge] = useState(false);
  // 既定をフィードへ切り替えたことの案内(スポットライト)。端末に1回だけ
  const [showSwitchNotice, setShowSwitchNotice] = useState(false);
  /*
    端末の記憶から表示形式が確定したか。

    初期描画は既定(フィード)なので、確定前に prompt-actions を取りに行くと
    グリッドを選んでいる端末にも毎回無駄なリクエストが飛ぶ。
    描画そのものは既定のまま進めて（フィード利用者にちらつきを出さない）、
    問い合わせだけ確定後に回す。
  */
  const [isViewModeResolved, setIsViewModeResolved] = useState(false);
  const didTriggerPostedRefreshRef = useRef(false);
  /*
    「サーバー描画ぶんより新しい newest を既に持っている」フラグ。

    詳細から戻って一覧を復元したときもこれに当たるので、復元時に立てる。
    立てないと初回ロードの effect が initialPosts(20件)で一覧を出し直し、
    復元した件数ごと潰れて基準にするカードも消える(＝位置が戻らない)。
    タブを切り替えて戻ってきたときは loadedSortTypeRef が変わるので、
    この分岐には入らず通常どおり取り直される。
  */
  const hasFreshNewestPostsRef = useRef(false);
  // 画面幅からフィードカードのおおよその高さを出すため。SSR では既定幅を使う。
  const [viewportWidth, setViewportWidth] = useState(FEED_CARD_MAX_WIDTH_PX);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /*
    無限スクロールの先読み距離。

    フィードは1列でカードが縦に大きく、200px では1枚の一部にしかならない。
    トリガーが見えた時点で既に最後のカードを読んでいる状態になり、
    「下まで行ってから待たされる」体感になる。カード3枚ぶん手前で取りに行く。

    グリッドは複数カラムで1行が低いため、500px あれば数行ぶんの余裕になる。
  */
  const rootMargin = useMemo(() => {
    if (viewMode !== HOME_VIEW_MODES.feed) {
      return `${GRID_PREFETCH_MARGIN_PX}px`;
    }
    const cardWidth = Math.min(viewportWidth, FEED_CARD_MAX_WIDTH_PX);
    const cardHeight = cardWidth + FEED_CARD_CHROME_PX;
    return `${cardHeight * FEED_PREFETCH_CARDS}px`;
  }, [viewMode, viewportWidth]);

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin,
  });

  const consumePendingRefresh = useCallback(() => {
    const pending = consumePendingHomePostRefresh();
    if (!pending) {
      return;
    }

    /*
      ⭐ 完了の合図はここでは出さない。

      投稿しても画面が動かなくなったので、トーストと付与モーダルは
      投稿したその場で `PostProgressHost` が出す。ここに残しておくと、
      あとでホームを開いたときに**もう一度**出てしまう
      (sessionStorage は遷移しなくても残るため)。

      ここが受け持つのは新着の同期(ハイライト)だけ。
    */
    setPendingHomePostRefresh(pending);
  }, []);

  useEffect(() => {
    consumePendingRefresh();
  }, [consumePendingRefresh]);

  useEffect(() => {
    window.addEventListener(HOME_POST_REFRESH_EVENT, consumePendingRefresh);
    return () => {
      window.removeEventListener(HOME_POST_REFRESH_EVENT, consumePendingRefresh);
    };
  }, [consumePendingRefresh]);

  // 現在のユーザーIDを取得
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 端末に記憶された表示形式を復元する(検索画面は常にグリッド)
  useEffect(() => {
    if (isSearchPage) {
      return;
    }
    /*
      切替の案内をまだ出していない端末は、**保存値を無視して1回だけ**
      フィードにする。既定値を変えるだけでは、過去にトグルを押した端末は
      保存値が優先されて変わらず、まさに関心のある層が母数から抜ける。

      このときの切替は `trackViewModeChanged` を呼ばない。運営都合の切替を
      混ぜると全員が1回 grid→feed した記録になり、「自分で戻した人の割合」が
      出せなくなる（ADR-004）。
    */
    const storedMode = getHomeViewMode();
    /*
      上書きするのは「**自分でグリッドを選んだ端末**」だけ。

      保存が無い端末（新規・未ログイン、および一度もトグルを触っていない
      既存ユーザー）は、既定が feed になった時点でフィードで開くので
      上書きの必要が無い。ここを分けないと、初めて来た人にまで
      「表示が新しくなりました」が出てしまい、
      チュートリアル開始モーダルとも重なる。

      強制切替の記録は案内とは別のフラグに持つ。案内は他のモーダルが
      開いていると出せず次回へ持ち越すため、案内フラグだけで判定すると
      出せなかった端末を毎回上書きしてしまう。
    */
    const isFirstVisitAfterRollout = shouldForceFeedView();
    const isForcedSwitch =
      isFirstVisitAfterRollout && storedMode === HOME_VIEW_MODES.grid;
    const nextMode = isForcedSwitch ? HOME_VIEW_MODES.feed : storedMode;

    setViewMode(nextMode);

    /*
      フラグの意味は「切り替えた」ではなく「**この端末では移行処理を済ませた**」。

      切り替えたときだけ立てると、保存が無い端末(新規・未ログイン)は
      フラグが立たないまま残り、**あとからグリッドを選んだ瞬間に対象になって
      設定を奪われる**。その人にとっては何も新しくなっていないのに
      「表示が新しくなりました」まで出てしまう。
    */
    if (isFirstVisitAfterRollout) {
      markForcedFeedView();
    }

    if (isForcedSwitch) {
      setHomeViewMode(nextMode);
      setShowSwitchNotice(shouldShowHomeViewSwitchNotice());
    }

    setIsViewModeResolved(true);

    // 分母(ADR-006)。セッション内で表示形式ごとに1回だけ送られる。
    trackHomeViewed(nextMode);
    markHomeFeedNewBadgeSeen();
  }, [isSearchPage]);

  const isFeedView = viewMode === HOME_VIEW_MODES.feed && !isSearchPage;
  // 「このプロンプトで作る」の可否は、詳細と同じ検証経路からサーバーで導出する
  // (一覧の payload には載らない。ADR-005)。
  const feedPostIds = useMemo(
    () =>
      isFeedView && isViewModeResolved
        ? posts.map((post) => post.id).filter((id): id is string => Boolean(id))
        : [],
    [isFeedView, isViewModeResolved, posts]
  );
  const { summaries: promptActions, styleLinks } = useFeedPromptActions(
    feedPostIds,
    isFeedView
  );

  /*
    フォロー状態はフィード表示のときだけ解決する(グリッドのカードには出ないので
    取得コストを増やさない)。カードごとに問い合わせると20件で20リクエストになる。

    投稿者と原作者の**両方**を解決する。派生投稿では両者が別人で、
    作者行のフォローボタンは投稿者を、CTA のフォロー判定は原作者を見るため、
    ひとつの値で兼ねると「派生投稿者はフォロー済みだが原作者は未フォロー」の
    閲覧者に『このプロンプトで作る』が出て、生成 API で弾かれる。
  */
  const feedAuthorIds = useMemo(() => {
    if (!isFeedView) {
      return [];
    }
    const ids = new Set<string>();
    for (const post of posts) {
      if (post.user?.id) {
        ids.add(post.user.id);
      }
      const originAuthorId = post.id ? promptActions[post.id]?.originAuthorId : null;
      if (originAuthorId) {
        ids.add(originAuthorId);
      }
    }
    return Array.from(ids);
  }, [isFeedView, posts, promptActions]);
  const { followStatuses, setFollowStatus } = useFeedFollowStatus(
    feedAuthorIds,
    currentUserId,
    isFeedView
  );

  const handleViewModeChange = useCallback(
    (nextMode: HomeViewMode) => {
      if (nextMode === viewMode) {
        return;
      }
      // 表示形式を自分で切り替えたら「続きから」は破棄する。
      // 見え方を変えた直後に前の位置へ飛ばされる方が戸惑う
      clearHomeFeedRestoreSnapshot();
      setViewMode(nextMode);
      setHomeViewMode(nextMode);
      trackViewModeChanged(viewMode, nextMode);
      // 切替先も分母に数える(切替後に何をしたかを同じ土俵で比較するため)
      trackHomeViewed(nextMode);
      if (nextMode === HOME_VIEW_MODES.feed) {
        markHomeFeedNewBadgeSeen();
        setShowViewModeNewBadge(false);
      }
    },
    [viewMode]
  );

  // URLパラメータでsortが指定されている場合
  useEffect(() => {
    const sortParam = searchParams.get("sort");
    if (sortParam && isValidSortType(sortParam)) {
      setPrevSortType(sortType); // 現在のタブを記録
      setSortType(sortParam);
    } else {
      // sortパラメータがない場合はデフォルト値を使用
      setSortType(defaultSortType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // ソートタイプ変更時の処理（タブの見た目を即反映）
  const handleSortChange = useCallback((newSortType: SortType) => {
    // 並び替えたら別の一覧。保存済みの位置は意味を失う
    clearHomeFeedRestoreSnapshot();
    setPrevSortType(sortType);
    setSortType(newSortType);
  }, [sortType]);

  /*
    ⭐ 昇格前に中間タブ（このとき week）を選んでいた場合の追随。

    可否の初期値は公開フラグなので、段階公開中は false から始まり、
    `PopularPromptsAvailabilityLoader` が遅れて true へ昇格させる。
    その間に運営が中間タブを選んでいると、昇格後は SortTabs から week が
    消えるのに `sortType` は "week" のまま残り、**選択中のタブが無い状態**になる。
    可否が変わった瞬間に popular_prompts へ寄せて、表示と選択を一致させる。
  */
  useEffect(() => {
    if (popularPromptsAvailable && sortType === "week") {
      handleSortChange("popular_prompts");
    }
  }, [popularPromptsAvailable, sortType, handleSortChange]);

  const loadPosts = useCallback(async (newOffset: number, reset: boolean = false) => {
    if (sortType === "following" && !currentUserId) {
      setPosts([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }
    // タブ切り替え時は即座にスケルトン表示（UX改善）
    if (reset) {
      setPosts([]);
      setHasMore(true);
    }
    setIsLoading(true);
    try {
      const shouldBypassClientCache =
        reset &&
        sortType === defaultSortType &&
        !normalizedSearchQuery &&
        pendingHomePostRefresh !== null;

      // 検索クエリが存在する場合、APIリクエストにqパラメータを追加
      const params = new URLSearchParams({
        limit: "20",
        offset: newOffset.toString(),
        sort: sortType,
      });
      if (normalizedSearchQuery) {
        params.set("q", normalizedSearchQuery);
      }
      
      const response = await fetch(`/api/posts?${params.toString()}`, {
        cache: shouldBypassClientCache ? "no-store" : "default",
      });
      const data = await response.json();

      if (response.ok) {
        const nextPosts = data.posts as Post[];

        if (reset) {
          setPosts(nextPosts);
          setOffset(nextPosts.length);
          loadedSortTypeRef.current = sortType;
          loadedSearchQueryRef.current = normalizedSearchQuery;
        } else {
          setPosts((prev) => [...prev, ...nextPosts]);
          setOffset((prev) => prev + nextPosts.length);
        }
        setHasMore(data.hasMore);

        if (shouldBypassClientCache) {
          hasFreshNewestPostsRef.current = true;
          if (
            pendingHomePostRefresh?.action === "posted" &&
            nextPosts.some((post) => post.id === pendingHomePostRefresh.postId)
          ) {
            setHighlightPostId(pendingHomePostRefresh?.postId ?? null);
          }
        }
      } else {
        console.error("Failed to load posts:", data.error);
      }
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      if (
        reset &&
        sortType === defaultSortType &&
        !normalizedSearchQuery &&
        pendingHomePostRefresh !== null
      ) {
        setPendingHomePostRefresh(null);
      }
      setIsLoading(false);
    }
  }, [
    sortType,
    currentUserId,
    normalizedSearchQuery,
    defaultSortType,
    pendingHomePostRefresh,
  ]);

  const loadMorePosts = useCallback(() => {
    loadPosts(offset, false);
  }, [loadPosts, offset]);

  // sortType / currentUserId / searchQuery に応じたモーダル表示とデータロード
  useEffect(() => {
    const shouldShowAuth = sortType === "following" && !currentUserId;
    const shouldForceNewestRefresh =
      pendingHomePostRefresh !== null &&
      sortType === defaultSortType &&
      !normalizedSearchQuery &&
      !didTriggerPostedRefreshRef.current;
    const shouldReuseFreshNewestPosts =
      sortType === defaultSortType &&
      loadedSortTypeRef.current === defaultSortType &&
      loadedSearchQueryRef.current === "" &&
      !normalizedSearchQuery &&
      hasFreshNewestPostsRef.current;

    setShowAuthPrompt(shouldShowAuth);
    if (!shouldShowAuth) {
      if (shouldReuseFreshNewestPosts) {
        setIsLoading(false);
        return;
      }

      // skipInitialFetch かつキャッシュデータがある場合、該当タブのときは初回フェッチをスキップ
      // 他タブから戻ってきたときはキャッシュデータを復元する
      if (skipInitialFetch && !normalizedSearchQuery) {
        if (
          !shouldForceNewestRefresh &&
          sortType === defaultSortType &&
          initialPosts.length > 0 &&
          !hasFreshNewestPostsRef.current
        ) {
          setPosts(initialPosts);
          setHasMore(initialPosts.length === 20);
          setOffset(initialPosts.length);
          loadedSortTypeRef.current = defaultSortType;
          loadedSearchQueryRef.current = "";
          setIsLoading(false);
          return;
        }
        // ⭐ `sortType === "week"` の直書きをやめる。中間タブは可否によって
        //    week / popular_prompts のどちらにもなるため、渡された sort と
        //    突き合わせないと片方の初期配列が捨てられる。
        if (sortType === initialMiddleSort && initialMiddlePosts.length > 0) {
          setPosts(initialMiddlePosts);
          setHasMore(initialMiddlePosts.length === 20);
          setOffset(initialMiddlePosts.length);
          loadedSortTypeRef.current = initialMiddleSort;
          loadedSearchQueryRef.current = "";
          setIsLoading(false);
          return;
        }
      }

      if (shouldForceNewestRefresh) {
        didTriggerPostedRefreshRef.current = true;
      }

      // フォロータブかつログイン済み、または他タブの場合のみロード
      // 検索クエリ変更時もリセットして再取得
      loadPosts(0, true);
    } else {
      // 未ログインのフォロータブはリストをクリア
      setPosts([]);
      setHasMore(false);
      loadedSortTypeRef.current = null;
      loadedSearchQueryRef.current = null;
    }
  }, [
    sortType,
    currentUserId,
    normalizedSearchQuery,
    loadPosts,
    skipInitialFetch,
    initialPosts,
    initialMiddlePosts,
    initialMiddleSort,
    defaultSortType,
    pendingHomePostRefresh,
    // loadedSortTypeRef / loadedSearchQueryRef は ref なので依存に入れない
    // (入れていたころ、検索クエリありで無限ループしていた)
  ]);

  /*
    詳細から戻ってきたときに一覧を復元し、タップした投稿を基準に位置を戻す。

    **描画の初期値ではなくマウント後に入れる。** 初期値で復元すると、
    サーバーには保存領域が無いのに クライアントだけ件数が増え、
    ハイドレーション不一致で React がツリーを作り直す(実際に踏んだ)。
    一瞬20件が見えるが、位置合わせは数フレーム追従するので実害はない。

    useLayoutEffect なのは、初回ロードの effect(useEffect)より先に
    hasFreshNewestPostsRef を立てて、20件での出し直しを止めるため。
  */
  useLayoutEffect(() => {
    const snapshot = isSearchPage
      ? null
      : peekHomeFeedRestoreSnapshot({
          sortType: defaultSortType,
          searchQuery: normalizedSearchQuery,
        });
    if (!snapshot) {
      return;
    }
    clearHomeFeedRestoreSnapshot();
    hasFreshNewestPostsRef.current = true;
    setPosts(snapshot.posts);
    setOffset(snapshot.offset);
    setHasMore(snapshot.hasMore);
    return restoreHomeFeedScroll(snapshot);
    // 復元はマウント時に1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タップ時に読む「いまの一覧」。クリックはレンダー後なので effect 同期で足りる
  const feedStateRef = useRef({ posts, offset, hasMore, sortType, viewMode });
  useEffect(() => {
    feedStateRef.current = { posts, offset, hasMore, sortType, viewMode };
  }, [posts, offset, hasMore, sortType, viewMode]);

  /*
    投稿をタップした瞬間の状態を控える。

    位置は scrollY ではなく「タップしたカードが画面のどこにあったか」で持つ。
    絶対位置は画像・フォント・上部バナー・表示形式の切替で簡単に変わるが、
    「あのカードが画面のこの高さにあった」は変わらない。
  */
  const rememberFeedPosition = useCallback(
    (postId: string | undefined, element: HTMLElement) => {
      if (!postId || isSearchPage) {
        return;
      }
      const current = feedStateRef.current;
      // 初期20件のままなら、戻ってもサーバー描画で同じ高さになる(復元不要)
      if (current.posts.length <= 20) {
        return;
      }
      saveHomeFeedRestoreSnapshot({
        posts: current.posts,
        offset: current.offset,
        hasMore: current.hasMore,
        sortType: current.sortType,
        viewMode: current.viewMode,
        searchQuery: normalizedSearchQuery,
        anchorPostId: postId,
        anchorTop: element.getBoundingClientRect().top,
        scrollY: window.scrollY,
      });
    },
    [isSearchPage, normalizedSearchQuery]
  );

  useEffect(() => {
    if (!highlightPostId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightPostId(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightPostId]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadMorePosts();
    }
  }, [inView, hasMore, isLoading, loadMorePosts]);

  useEffect(() => {
    if (!hasModerationRefresh || isLoading) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("mod_refresh");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [hasModerationRefresh, isLoading, pathname, router, searchParams]);

  // 期間別ソートの場合のメッセージ
  const getEmptyMessage = () => {
    // 検索クエリが存在する場合は専用メッセージを表示
    if (normalizedSearchQuery) {
      return postsT("noMatch", { query: normalizedSearchQuery });
    }
    
    if (sortType === "following") {
      return postsT("noFollowingPosts");
    } else if (sortType === "daily") {
      return postsT("preparing");
    } else if (sortType === "week") {
      return postsT("preparing");
    } else if (sortType === "popular_prompts") {
      return postsT("noPopularPrompts");
    } else if (sortType === "month") {
      return postsT("preparing");
    }
    return postsT("emptyState");
  };

  return (
    <>
      {/* 検索画面ではSortTabsを非表示 */}
      {!isSearchPage && (
        <div className="mb-4 flex items-end justify-between gap-2 border-b">
          {/* タブ=何を見るか / トグル=どう見るか。両者は独立している */}
          <SortTabs value={sortType} onChange={handleSortChange} currentUserId={currentUserId} />
          {/* トグルは 40px(タブの 36px より少し高い)。ホームのスケルトンも 40px なので
              差し替え時のレイアウトシフトは出ない */}
          <div>
            <HomeViewToggle
              value={viewMode}
              onChange={handleViewModeChange}
              showNewBadge={showViewModeNewBadge}
            />
          </div>
        </div>
      )}
      {posts.length === 0 ? (
        // ローディング中はスケルトン表示
        isLoading ? (
          <PostListSkeleton />
        ) : (
          // ローディング完了後、期間別ソート、フォロータブ、または検索結果が0件の場合はメッセージを表示
          // 「新着」タブで検索クエリがない場合は何も表示しない
          (sortType !== "newest" || normalizedSearchQuery) && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{getEmptyMessage()}</p>
            </div>
          )
        )
      ) : (
        <>
          {/*
            描画の判定は isFeedView(検索画面を除外済み)を使う。
            viewMode を直接見ると、既定がフィードになった今は
            トグルを出していない検索画面までフィードで描画される
          */}
          {isFeedView ? (
            // フィード: スマホもPCも1列。読みやすさのため最大幅を絞って中央寄せする。
            // 幅の正本は FEED_CARD_MAX_WIDTH_PX(Tailwind の任意値はリテラルが要るため直書き)
            <div className="mx-auto flex max-w-[600px] flex-col">
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  data-post-id={post.id}
                  className="mb-4"
                  // 遷移が始まる前に控える(キャプチャ段階)
                  onClickCapture={(event) =>
                    rememberFeedPosition(post.id, event.currentTarget)
                  }
                >
                  <PostFeedCard
                    post={post}
                    currentUserId={currentUserId}
                    isHighlighted={post.id === highlightPostId}
                    prioritizeImage={index < 2}
                    trackImpressions={trackImpressions}
                    isFollowingAuthor={
                      post.user?.id ? followStatuses[post.user.id] : undefined
                    }
                    isFollowingPromptAuthor={(() => {
                      // CTA のフォロー判定は原作者を見る(派生投稿では投稿者と別人)
                      const originAuthorId = post.id
                        ? promptActions[post.id]?.originAuthorId
                        : null;
                      return originAuthorId ? followStatuses[originAuthorId] : undefined;
                    })()}
                    onFollowChange={setFollowStatus}
                    promptAction={post.id ? promptActions[post.id] : undefined}
                    stylePresetLink={post.id ? styleLinks[post.id] : undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Masonry
              breakpointCols={{
                default: 4,
                1024: 2,
                640: 2,
              }}
              className="flex -ml-1 w-auto sm:-ml-4"
              columnClassName="pl-1 bg-clip-padding sm:pl-4"
            >
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  data-post-id={post.id}
                  className="mb-4"
                  onClickCapture={(event) =>
                    rememberFeedPosition(post.id, event.currentTarget)
                  }
                >
                  <PostCard
                    post={post}
                    currentUserId={currentUserId}
                    isHighlighted={post.id === highlightPostId}
                    prioritizeImage={index < 2}
                    trackImpressions={trackImpressions}
                  />
                </div>
              ))}
            </Masonry>
          )}

          {/* 無限スクロール用のトリガー要素 */}
          {hasMore && (
            <div ref={ref} className="py-4">
              {isLoading && <PostListLoadMoreSkeleton />}
            </div>
          )}

          {/* 全て読み込み完了時のメッセージ */}
          {!hasMore && posts.length > 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {postsT("allShown")}
            </div>
          )}
        </>
      )}
      <AuthModal
        open={showAuthPrompt && !currentUserId}
        onClose={() => {
          setShowAuthPrompt(false);
          if (!currentUserId && sortType === "following") {
            setSortType(prevSortType);
          }
        }}
        redirectTo={currentPath}
      />
      <HomeViewSwitchNotice
        open={showSwitchNotice}
        onClose={() => setShowSwitchNotice(false)}
      />
      {postBonus ? (
        <PostBonusModal
          open
          onOpenChange={(next) => {
            if (!next) {
              setPostBonus(null);
            }
          }}
          amount={postBonus.amount}
          multiplier={postBonus.multiplier}
          generationType={postBonus.generationType}
          promptUsageRewardAmount={promptUsageRewardAmount}
          isPromptUse={postBonus.isPromptUse}
        />
      ) : null}
    </>
  );
}

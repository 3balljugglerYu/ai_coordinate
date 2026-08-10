"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { PostFeedCard } from "./PostFeedCard";
import { PostListSkeleton } from "./PostListSkeleton";
import { PostListLoadMoreSkeleton } from "./PostListLoadMoreSkeleton";
import { SortTabs } from "./SortTabs";
import { HomeViewToggle } from "./HomeViewToggle";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useToast } from "@/components/ui/use-toast";
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
  shouldShowHomeFeedNewBadge,
  type HomeViewMode,
} from "../lib/home-view-preference";
import { useFeedFollowStatus } from "../hooks/useFeedFollowStatus";
import { useFeedPromptActions } from "../hooks/useFeedPromptActions";
import { trackHomeViewed, trackViewModeChanged } from "../lib/home-view-events";

interface PostListProps {
  initialPosts?: Post[];
  /** オススメタブ用のキャッシュ済みデータ（CachedHomePostList から渡す） */
  initialPostsForWeek?: Post[];
  forceInitialLoading?: boolean;
  /** 親がデータを提供している場合、初回の loadPosts をスキップ（キャッシュ表示の最適化用） */
  skipInitialFetch?: boolean;
  /** viewable インプレッション計測を有効にする(ホームフィードのみ true) */
  trackImpressions?: boolean;
}

export function PostList({
  initialPosts = [],
  initialPostsForWeek = [],
  forceInitialLoading = false,
  skipInitialFetch = false,
  trackImpressions = false,
}: PostListProps) {
  const postsT = useTranslations("posts");
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>(forceInitialLoading ? [] : initialPosts);
  const [isLoading, setIsLoading] = useState(forceInitialLoading);
  const [hasMore, setHasMore] = useState(forceInitialLoading ? true : initialPosts.length === 20);
  const [offset, setOffset] = useState(forceInitialLoading ? 0 : initialPosts.length);
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
  const [sortType, setSortType] = useState<SortType>(defaultSortType);
  const [prevSortType, setPrevSortType] = useState<SortType>(defaultSortType);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadedSortType, setLoadedSortType] = useState<SortType | null>(
    forceInitialLoading ? null : defaultSortType
  );
  const [loadedSearchQuery, setLoadedSearchQuery] = useState(
    forceInitialLoading ? null : ""
  );
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [pendingHomePostRefresh, setPendingHomePostRefresh] =
    useState<PendingHomePostRefresh | null>(null);
  // 表示形式は端末に記憶する。SSR とハイドレーション不一致を避けるため、
  // 初期値は既定(グリッド)にしてマウント後に localStorage から復元する。
  const [viewMode, setViewMode] = useState<HomeViewMode>(DEFAULT_HOME_VIEW_MODE);
  const [showViewModeNewBadge, setShowViewModeNewBadge] = useState(false);
  const didTriggerPostedRefreshRef = useRef(false);
  const hasFreshNewestPostsRef = useRef(false);
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const consumePendingRefresh = useCallback(() => {
    const pending = consumePendingHomePostRefresh();
    if (!pending) {
      return;
    }

    setPendingHomePostRefresh(pending);
    if (pending.action === "posted") {
      const hasBoostedBonus =
        pending.subscriptionPlan &&
        pending.subscriptionPlan !== "free" &&
        typeof pending.bonusMultiplier === "number" &&
        pending.bonusMultiplier > 1;
      const boostedMultiplier = hasBoostedBonus
        ? pending.bonusMultiplier
        : null;

      toast({
        title:
          pending.bonusGranted && pending.bonusGranted > 0
            ? postsT("dailyBonusTitle")
            : postsT("postSuccess"),
        description:
          pending.bonusGranted && pending.bonusGranted > 0
            ? (
                <div className="space-y-2">
                  <p>{postsT("dailyBonusDescription", { amount: pending.bonusGranted })}</p>
                  {hasBoostedBonus ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700">
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 shadow-sm"
                      >
                        {postsT("dailyBonusMultiplierBadge", {
                          multiplier: boostedMultiplier?.toFixed(1) ?? "1.0",
                        })}
                      </Badge>
                    </div>
                  ) : null}
                </div>
              )
            : undefined,
      });
    }
  }, [postsT, toast]);

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
    const storedMode = getHomeViewMode();
    setViewMode(storedMode);
    // 分母(ADR-006)。セッション内で表示形式ごとに1回だけ送られる。
    trackHomeViewed(storedMode);
    if (storedMode === HOME_VIEW_MODES.feed) {
      // 既にフィードを使っている端末には NEW を出さない
      markHomeFeedNewBadgeSeen();
      return;
    }
    setShowViewModeNewBadge(shouldShowHomeFeedNewBadge(Date.now()));
  }, [isSearchPage]);

  const isFeedView = viewMode === HOME_VIEW_MODES.feed && !isSearchPage;
  // 「このプロンプトで作る」の可否は、詳細と同じ検証経路からサーバーで導出する
  // (一覧の payload には載らない。ADR-005)。
  const feedPostIds = useMemo(
    () =>
      isFeedView
        ? posts.map((post) => post.id).filter((id): id is string => Boolean(id))
        : [],
    [isFeedView, posts]
  );
  const promptActions = useFeedPromptActions(feedPostIds, isFeedView);

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
    setPrevSortType(sortType);
    setSortType(newSortType);
  }, [sortType]);

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
          setLoadedSortType(sortType);
          setLoadedSearchQuery(normalizedSearchQuery);
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
      loadedSortType === defaultSortType &&
      loadedSearchQuery === "" &&
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
          setLoadedSortType(defaultSortType);
          setLoadedSearchQuery("");
          setIsLoading(false);
          return;
        }
        if (sortType === "week" && initialPostsForWeek.length > 0) {
          setPosts(initialPostsForWeek);
          setHasMore(initialPostsForWeek.length === 20);
          setOffset(initialPostsForWeek.length);
          setLoadedSortType("week");
          setLoadedSearchQuery("");
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
      setLoadedSortType(null);
      setLoadedSearchQuery(null);
    }
  }, [
    sortType,
    currentUserId,
    normalizedSearchQuery,
    loadPosts,
    skipInitialFetch,
    initialPosts,
    initialPostsForWeek,
    defaultSortType,
    pendingHomePostRefresh,
    loadedSortType,
    loadedSearchQuery,
  ]);

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
          {/* pb-1 でタブ(py-2 + text-sm = 36px)と行の高さを揃え、レイアウトシフトを防ぐ */}
          <div className="pb-1">
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
          {viewMode === HOME_VIEW_MODES.feed ? (
            // フィード: スマホもPCも1列。読みやすさのため最大幅を絞って中央寄せする
            <div className="mx-auto flex max-w-[600px] flex-col">
              {posts.map((post, index) => (
                <div key={post.id} className="mb-4">
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
                <div key={post.id} className="mb-4">
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
    </>
  );
}

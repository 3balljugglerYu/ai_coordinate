"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { PostListSkeleton } from "./PostListSkeleton";
import { PostListLoadMoreSkeleton } from "./PostListLoadMoreSkeleton";
import { SortTabs } from "./SortTabs";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useToast } from "@/components/ui/use-toast";
import type { Post, SortType } from "../types";
import { isValidSortType } from "../lib/utils";
import {
  consumePendingHomePostRefresh,
  type PendingHomePostRefresh,
} from "../lib/home-post-refresh";

interface PostListProps {
  initialPosts?: Post[];
  /** オススメタブ用のキャッシュ済みデータ（CachedHomePostList から渡す） */
  initialPostsForWeek?: Post[];
  forceInitialLoading?: boolean;
  /** 親がデータを提供している場合、初回の loadPosts をスキップ（キャッシュ表示の最適化用） */
  skipInitialFetch?: boolean;
}

export function PostList({
  initialPosts = [],
  initialPostsForWeek = [],
  forceInitialLoading = false,
  skipInitialFetch = false,
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
  const didTriggerPostedRefreshRef = useRef(false);
  const hasFreshNewestPostsRef = useRef(false);
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  useEffect(() => {
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
        <div className="mb-4">
          <SortTabs value={sortType} onChange={handleSortChange} currentUserId={currentUserId} />
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
        />
      </div>
    ))}
  </Masonry>

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

"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { SortTabs } from "./SortTabs";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import type { Post, SortType } from "../types";
import { isValidSortType } from "../lib/utils";

interface PostListProps {
  initialPosts?: Post[];
  forceInitialLoading?: boolean;
}

export function PostList({
  initialPosts = [],
  forceInitialLoading = false,
}: PostListProps) {
  const [posts, setPosts] = useState<Post[]>(forceInitialLoading ? [] : initialPosts);
  const [isLoading, setIsLoading] = useState(forceInitialLoading);
  const [hasMore, setHasMore] = useState(forceInitialLoading ? true : initialPosts.length === 20);
  const [offset, setOffset] = useState(forceInitialLoading ? 0 : initialPosts.length);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = pathname;
  const searchQuery = searchParams.get("q") || "";
  const hasModerationRefresh = searchParams.get("mod_refresh") === "1";
  const isSearchPage = pathname === "/search";
  // 検索画面の場合はデフォルトでpopular、それ以外はnewest
  const defaultSortType: SortType = isSearchPage ? "popular" : "newest";
  const [sortType, setSortType] = useState<SortType>(defaultSortType);
  const [prevSortType, setPrevSortType] = useState<SortType>(defaultSortType);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

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
    setIsLoading(true);
    try {
      // 検索クエリが存在する場合、APIリクエストにqパラメータを追加
      const params = new URLSearchParams({
        limit: "20",
        offset: newOffset.toString(),
        sort: sortType,
      });
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      
      const response = await fetch(`/api/posts?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        if (reset) {
          setPosts(data.posts);
          setOffset(data.posts.length);
        } else {
          setPosts((prev) => [...prev, ...data.posts]);
          setOffset((prev) => prev + data.posts.length);
        }
        setHasMore(data.hasMore);
      } else {
        console.error("Failed to load posts:", data.error);
      }
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sortType, currentUserId, searchQuery]);

  const loadMorePosts = useCallback(() => {
    loadPosts(offset, false);
  }, [loadPosts, offset]);

  // sortType / currentUserId / searchQuery に応じたモーダル表示とデータロード
  useEffect(() => {
    const shouldShowAuth = sortType === "following" && !currentUserId;
    setShowAuthPrompt(shouldShowAuth);
    if (!shouldShowAuth) {
      // フォロータブかつログイン済み、または他タブの場合のみロード
      // 検索クエリ変更時もリセットして再取得
      loadPosts(0, true);
    } else {
      // 未ログインのフォロータブはリストをクリア
      setPosts([]);
      setHasMore(false);
    }
  }, [sortType, currentUserId, searchQuery, loadPosts]);

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
    if (searchQuery.trim()) {
      return `"${searchQuery.trim()}"に一致する投稿が見つかりませんでした`;
    }
    
    if (sortType === "following") {
      return "フォローしているユーザーの投稿がありません";
    } else if (sortType === "daily") {
      return "準備中...";
    } else if (sortType === "week") {
      return "準備中...";
    } else if (sortType === "month") {
      return "準備中...";
    }
    return "まだ投稿がありません。最初の投稿をしてみましょう！";
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
        // ローディング中はインジケータのみ表示
        isLoading ? (
          <div className="py-12 text-center">
            <div className="text-muted-foreground">読み込み中...</div>
          </div>
        ) : (
          // ローディング完了後、期間別ソート、フォロータブ、または検索結果が0件の場合はメッセージを表示
          // 「新着」タブで検索クエリがない場合は何も表示しない
          (sortType !== "newest" || searchQuery.trim()) && (
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
            className="flex -ml-4 w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {posts.map((post) => (
              <div key={post.id} className="mb-4">
        <PostCard post={post} currentUserId={currentUserId} />
      </div>
    ))}
  </Masonry>

          {/* 無限スクロール用のトリガー要素 */}
          {hasMore && (
            <div ref={ref} className="py-8 text-center">
              {isLoading && (
                <div className="text-muted-foreground">読み込み中...</div>
              )}
            </div>
          )}

          {/* 全て読み込み完了時のメッセージ */}
          {!hasMore && posts.length > 0 && (
            <div className="py-8 text-center text-muted-foreground">
              全ての投稿を表示しました
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

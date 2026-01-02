"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { SortTabs, type SortType } from "./SortTabs";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/features/auth/components/AuthModal";
import type { Post } from "../types";

interface PostListProps {
  initialPosts?: Post[];
}

export function PostList({ initialPosts = [] }: PostListProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length === 20);
  const [offset, setOffset] = useState(initialPosts.length);
  const [sortType, setSortType] = useState<SortType>("newest");
  const [prevSortType, setPrevSortType] = useState<SortType>("newest");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = pathname;
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

  // URLパラメータでsort=followingが指定されている場合
  useEffect(() => {
    const sortParam = searchParams.get("sort");
    if (pathname === "/" && sortParam === "following") {
      setPrevSortType((prev) => prev); // 現在のタブを記録（デフォルト保持）
      setSortType("following");
    }
  }, [pathname, searchParams]);

  // ソートタイプ変更時の処理（タブの見た目を即反映）
  const handleSortChange = useCallback((newSortType: SortType) => {
    setPrevSortType((prev) => sortType);
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
      const response = await fetch(
        `/api/posts?limit=20&offset=${newOffset}&sort=${sortType}`
      );
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
  }, [sortType, currentUserId]);

  const loadMorePosts = useCallback(() => {
    loadPosts(offset, false);
  }, [loadPosts, offset]);

  // sortType / currentUserId に応じたモーダル表示とデータロード
  useEffect(() => {
    const shouldShowAuth = sortType === "following" && !currentUserId;
    setShowAuthPrompt(shouldShowAuth);
    if (!shouldShowAuth) {
      // フォロータブかつログイン済み、または他タブの場合のみロード
      loadPosts(0, true);
    } else {
      // 未ログインのフォロータブはリストをクリア
      setPosts([]);
      setHasMore(false);
    }
  }, [sortType, currentUserId, loadPosts]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadMorePosts();
    }
  }, [inView, hasMore, isLoading, loadMorePosts]);

  // 期間別ソートの場合のメッセージ
  const getEmptyMessage = () => {
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
      <div className="mb-4">
        <SortTabs value={sortType} onChange={handleSortChange} currentUserId={currentUserId} />
      </div>
      {posts.length === 0 ? (
        // ローディング中はインジケータのみ表示
        isLoading ? (
          <div className="py-12 text-center">
            <div className="text-muted-foreground">読み込み中...</div>
          </div>
        ) : (
          // ローディング完了後、期間別ソートまたはフォロータブの場合はメッセージを表示
          // 「新着」タブの場合は何も表示しない
          sortType !== "newest" && (
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

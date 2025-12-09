"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { SortTabs, type SortType } from "./SortTabs";
import { createClient } from "@/lib/supabase/client";
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const prevPathnameRef = useRef<string | null>(null);
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

  // ホームページに遷移したときにタブを「新着」にリセット
  useEffect(() => {
    const reset = searchParams.get("reset");
    if (pathname === "/" && reset === "true") {
      setSortType("newest");
      // クエリパラメータを削除
      router.replace("/", { scroll: false });
    }
    prevPathnameRef.current = pathname;
  }, [pathname, searchParams.toString(), router]);

  const loadPosts = useCallback(async (newOffset: number, reset: boolean = false) => {
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
  }, [sortType]);

  const loadMorePosts = useCallback(() => {
    loadPosts(offset, false);
  }, [loadPosts, offset]);

  useEffect(() => {
    // ソートタイプが変更されたら投稿一覧をリセット
    loadPosts(0, true);
  }, [sortType, loadPosts]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadMorePosts();
    }
  }, [inView, hasMore, isLoading, loadMorePosts]);

  // 期間別ソートの場合のメッセージ
  const getEmptyMessage = () => {
    if (sortType === "daily") {
      return "昨日は投稿がありませんでした";
    } else if (sortType === "week") {
      return "先週は投稿がありませんでした";
    } else if (sortType === "month") {
      return "先月は投稿がありませんでした";
    }
    return "まだ投稿がありません。最初の投稿をしてみましょう！";
  };

  return (
    <>
      <div className="mb-4">
        <SortTabs value={sortType} onChange={setSortType} />
      </div>
      {posts.length === 0 ? (
        // ローディング中はインジケータのみ表示
        isLoading ? (
          <div className="py-12 text-center">
            <div className="text-muted-foreground">読み込み中...</div>
          </div>
        ) : (
          // ローディング完了後、期間別ソートの場合はメッセージを表示
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
    </>
  );
}

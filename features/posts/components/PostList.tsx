"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { PostCard } from "./PostCard";
import { SortTabs, type SortType } from "./SortTabs";
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
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  useEffect(() => {
    // ソートタイプが変更されたら投稿一覧をリセット
    if (sortType === "newest") {
      // 新着順ソートのみ実装
      loadPosts(0, true);
    }
  }, [sortType]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadMorePosts();
    }
  }, [inView, hasMore, isLoading]);

  const loadPosts = async (newOffset: number, reset: boolean = false) => {
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
  };

  const loadMorePosts = () => {
    loadPosts(offset, false);
  };

  if (posts.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">
          まだ投稿がありません。最初の投稿をしてみましょう！
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SortTabs value={sortType} onChange={setSortType} />
      </div>
      <Masonry
        breakpointCols={{
          default: 3,
          1024: 2,
          640: 2,
        }}
        className="flex -ml-4 w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {posts.map((post) => (
          <div key={post.id} className="mb-4">
            <PostCard post={post} />
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
  );
}

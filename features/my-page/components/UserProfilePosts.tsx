"use client";

import { useState, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { getPostImageUrl } from "@/features/posts/lib/utils";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface UserProfilePostsProps {
  initialPosts: GeneratedImageRecord[];
  userId: string;
  isOwnProfile: boolean;
}

const POSTS_PER_PAGE = 20;

export function UserProfilePosts({
  initialPosts,
  userId,
  isOwnProfile,
}: UserProfilePostsProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length === POSTS_PER_PAGE);
  const [offset, setOffset] = useState(initialPosts.length);

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const loadMorePosts = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/users/${userId}/posts?offset=${offset}&limit=${POSTS_PER_PAGE}`
      );
      if (!response.ok) {
        throw new Error("投稿の取得に失敗しました");
      }
      const newPosts = await response.json();
      if (newPosts.length === 0) {
        setHasMore(false);
      } else {
        setPosts((prev) => [...prev, ...newPosts]);
        setOffset((prev) => prev + newPosts.length);
        setHasMore(newPosts.length === POSTS_PER_PAGE);
      }
    } catch (error) {
      console.error("Failed to load more posts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, offset, isLoading, hasMore]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadMorePosts();
    }
  }, [inView, hasMore, isLoading, loadMorePosts]);

  if (posts.length === 0) {
    return (
      <Card className="border-dashed p-12">
        <p className="text-center text-sm text-gray-500">
          {isOwnProfile ? "まだ画像を生成していません" : "まだ投稿がありません"}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Masonry
        breakpointCols={{
          default: 3,
          1024: 2,
          640: 2,
        }}
        className="flex -ml-4 w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {posts.map((post) => {
          const imageUrl = getPostImageUrl({
            image_url: post.image_url,
            storage_path: post.storage_path,
          });
          const detailUrl = `/posts/${post.id}?from=profile&userId=${userId}`;

          return (
            <div key={post.id} className="mb-4">
              <Card className="overflow-hidden p-0">
                <Link href={detailUrl}>
                  <div className="relative w-full overflow-hidden bg-gray-100">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={post.caption || post.prompt || "画像"}
                        width={800}
                        height={800}
                        className="w-full h-auto object-contain transition-transform hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-gray-400">
                        画像がありません
                      </div>
                    )}
                  </div>
                </Link>
              </Card>
            </div>
          );
        })}
      </Masonry>

      {/* 無限スクロール用のトリガー */}
      {hasMore && (
        <div ref={ref} className="py-4">
          {isLoading && (
            <div className="text-center text-sm text-gray-500">
              読み込み中...
            </div>
          )}
        </div>
      )}
    </>
  );
}


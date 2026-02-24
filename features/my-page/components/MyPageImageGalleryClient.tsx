"use client";

import { useState, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { MyImageGallery } from "./MyImageGallery";
import { ImageTabs, type ImageFilter } from "./ImageTabs";
import { UserProfilePostsLoadMoreSkeleton } from "./UserProfilePostsLoadMoreSkeleton";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyPageImageGalleryClientProps {
  initialImages: GeneratedImageRecord[];
  currentUserId?: string | null;
}

const IMAGES_PER_PAGE = 20;

interface TabState {
  images: GeneratedImageRecord[];
  offset: number;
  hasMore: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
}

/**
 * クライアントコンポーネント: マイページの画像一覧（タブ別遅延ロード・無限スクロール）
 */
export function MyPageImageGalleryClient({
  initialImages,
  currentUserId,
}: MyPageImageGalleryClientProps) {
  const [filter, setFilter] = useState<ImageFilter>("all");

  // 「すべて」タブ: initialImages + 追加読み込み分
  const [allTabAdditionalImages, setAllTabAdditionalImages] = useState<
    GeneratedImageRecord[]
  >([]);
  const [allTabHasMore, setAllTabHasMore] = useState(
    initialImages.length === IMAGES_PER_PAGE
  );
  const [allTabIsLoading, setAllTabIsLoading] = useState(false);

  // 「投稿済み」「未投稿」タブ
  const [postedTab, setPostedTab] = useState<TabState>({
    images: [],
    offset: 0,
    hasMore: true,
    isLoading: false,
    hasLoaded: false,
  });
  const [unpostedTab, setUnpostedTab] = useState<TabState>({
    images: [],
    offset: 0,
    hasMore: true,
    isLoading: false,
    hasLoaded: false,
  });

  // initialImages が変更されたら「すべて」タブの追加分をリセット
  useEffect(() => {
    setAllTabAdditionalImages([]);
    setAllTabHasMore(initialImages.length === IMAGES_PER_PAGE);
  }, [initialImages]);

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const fetchImages = useCallback(
    async (
      filterParam: "all" | "posted" | "unposted",
      offset: number
    ): Promise<{ images: GeneratedImageRecord[]; hasMore: boolean }> => {
      const response = await fetch(
        `/api/my-page/images?filter=${filterParam}&limit=${IMAGES_PER_PAGE}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error("画像の取得に失敗しました");
      }
      const data = await response.json();
      return {
        images: data.images ?? [],
        hasMore: data.hasMore ?? false,
      };
    },
    []
  );

  const loadMoreAll = useCallback(async () => {
    if (allTabIsLoading || !allTabHasMore) return;

    setAllTabIsLoading(true);
    try {
      const offset = initialImages.length + allTabAdditionalImages.length;
      const { images: newImages, hasMore } = await fetchImages("all", offset);
      if (newImages.length === 0) {
        setAllTabHasMore(false);
      } else {
        setAllTabAdditionalImages((prev) => [...prev, ...newImages]);
        setAllTabHasMore(hasMore);
      }
    } catch (error) {
      console.error("Failed to load more images:", error);
    } finally {
      setAllTabIsLoading(false);
    }
  }, [
    allTabIsLoading,
    allTabHasMore,
    initialImages.length,
    allTabAdditionalImages.length,
    fetchImages,
  ]);

  const loadPostedTab = useCallback(async () => {
    if (postedTab.isLoading || postedTab.hasLoaded) return;

    setPostedTab((prev) => ({ ...prev, isLoading: true }));
    try {
      const { images: newImages, hasMore } = await fetchImages("posted", 0);
      setPostedTab({
        images: newImages,
        offset: newImages.length,
        hasMore,
        isLoading: false,
        hasLoaded: true,
      });
    } catch (error) {
      console.error("Failed to load posted images:", error);
      setPostedTab((prev) => ({ ...prev, isLoading: false }));
    }
  }, [postedTab.isLoading, postedTab.hasLoaded, fetchImages]);

  const loadMorePosted = useCallback(async () => {
    if (postedTab.isLoading || !postedTab.hasMore) return;

    setPostedTab((prev) => ({ ...prev, isLoading: true }));
    try {
      const { images: newImages, hasMore } = await fetchImages(
        "posted",
        postedTab.offset
      );
      if (newImages.length === 0) {
        setPostedTab((prev) => ({ ...prev, hasMore: false, isLoading: false }));
      } else {
        setPostedTab((prev) => ({
          ...prev,
          images: [...prev.images, ...newImages],
          offset: prev.offset + newImages.length,
          hasMore,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error("Failed to load more posted images:", error);
      setPostedTab((prev) => ({ ...prev, isLoading: false }));
    }
  }, [postedTab.isLoading, postedTab.hasMore, postedTab.offset, fetchImages]);

  const loadUnpostedTab = useCallback(async () => {
    if (unpostedTab.isLoading || unpostedTab.hasLoaded) return;

    setUnpostedTab((prev) => ({ ...prev, isLoading: true }));
    try {
      const { images: newImages, hasMore } = await fetchImages("unposted", 0);
      setUnpostedTab({
        images: newImages,
        offset: newImages.length,
        hasMore,
        isLoading: false,
        hasLoaded: true,
      });
    } catch (error) {
      console.error("Failed to load unposted images:", error);
      setUnpostedTab((prev) => ({ ...prev, isLoading: false }));
    }
  }, [unpostedTab.isLoading, unpostedTab.hasLoaded, fetchImages]);

  const loadMoreUnposted = useCallback(async () => {
    if (unpostedTab.isLoading || !unpostedTab.hasMore) return;

    setUnpostedTab((prev) => ({ ...prev, isLoading: true }));
    try {
      const { images: newImages, hasMore } = await fetchImages(
        "unposted",
        unpostedTab.offset
      );
      if (newImages.length === 0) {
        setUnpostedTab((prev) => ({ ...prev, hasMore: false, isLoading: false }));
      } else {
        setUnpostedTab((prev) => ({
          ...prev,
          images: [...prev.images, ...newImages],
          offset: prev.offset + newImages.length,
          hasMore,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error("Failed to load more unposted images:", error);
      setUnpostedTab((prev) => ({ ...prev, isLoading: false }));
    }
  }, [unpostedTab.isLoading, unpostedTab.hasMore, unpostedTab.offset, fetchImages]);

  // タブ切り替え時に初回取得をトリガー
  useEffect(() => {
    if (filter === "posted" && !postedTab.hasLoaded && !postedTab.isLoading) {
      loadPostedTab();
    } else if (
      filter === "unposted" &&
      !unpostedTab.hasLoaded &&
      !unpostedTab.isLoading
    ) {
      loadUnpostedTab();
    }
  }, [filter, postedTab.hasLoaded, postedTab.isLoading, unpostedTab.hasLoaded, unpostedTab.isLoading, loadPostedTab, loadUnpostedTab]);

  // 無限スクロール
  useEffect(() => {
    if (!inView) return;

    if (filter === "all" && allTabHasMore && !allTabIsLoading) {
      loadMoreAll();
    } else if (filter === "posted" && postedTab.hasMore && !postedTab.isLoading) {
      loadMorePosted();
    } else if (
      filter === "unposted" &&
      unpostedTab.hasMore &&
      !unpostedTab.isLoading
    ) {
      loadMoreUnposted();
    }
  }, [
    inView,
    filter,
    allTabHasMore,
    allTabIsLoading,
    postedTab.hasMore,
    postedTab.isLoading,
    unpostedTab.hasMore,
    unpostedTab.isLoading,
    loadMoreAll,
    loadMorePosted,
    loadMoreUnposted,
  ]);

  // 表示対象の画像をレンダー時に算出（rerender-derived-state-no-effect）
  const displayImages =
    filter === "all"
      ? [...initialImages, ...allTabAdditionalImages]
      : filter === "posted"
        ? postedTab.images
        : unpostedTab.images;

  const isLoadingMore =
    filter === "all"
      ? allTabIsLoading
      : filter === "posted"
        ? postedTab.isLoading
        : unpostedTab.isLoading;

  const hasMore =
    filter === "all"
      ? allTabHasMore
      : filter === "posted"
        ? postedTab.hasMore
        : unpostedTab.hasMore;

  const isInitialLoading =
    (filter === "posted" && !postedTab.hasLoaded && postedTab.isLoading) ||
    (filter === "unposted" && !unpostedTab.hasLoaded && unpostedTab.isLoading);

  return (
    <div>
      <ImageTabs value={filter} onChange={setFilter} />
      {isInitialLoading ? (
        <UserProfilePostsLoadMoreSkeleton />
      ) : (
        <MyImageGallery
          images={displayImages}
          currentUserId={currentUserId}
          loadMoreRef={ref}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
        />
      )}
    </div>
  );
}

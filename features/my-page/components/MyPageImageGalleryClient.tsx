"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MyImageGallery } from "./MyImageGallery";
import { ImageTabs, type ImageFilter } from "./ImageTabs";
import { UserProfilePostsLoadMoreSkeleton } from "./UserProfilePostsLoadMoreSkeleton";
import { BulkDeleteConfirmDialog } from "./BulkDeleteConfirmDialog";
import {
  BULK_DELETE_MAX,
  bulkDeleteMyImages,
} from "@/features/my-page/lib/api";
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
  const t = useTranslations("myPage");
  const { toast } = useToast();
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

  // ===== 一括削除関連の state =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 削除リクエスト中に楽観的にグレーアウトする ID
  const [pendingDeletionIds, setPendingDeletionIds] = useState<Set<string>>(
    new Set()
  );
  // 削除完了済み ID（initial / all tab additional / unposted tab の表示から除外）
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isUnpostedTab = filter === "unposted";

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
        const error = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(error?.error || t("imageFetchFailed"));
      }
      const data = await response.json();
      return {
        images: data.images ?? [],
        hasMore: data.hasMore ?? false,
      };
    },
    [t]
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

  // タブ切り替え時に選択状態をリセット
  const handleFilterChange = useCallback((next: ImageFilter) => {
    setFilter(next);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Esc で選択モード解除（確認ダイアログ表示中は Dialog 側が Esc を処理する）
  useEffect(() => {
    if (!selectionMode || confirmOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitSelectionMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectionMode, confirmOpen, exitSelectionMode]);

  const handleToggleSelect = useCallback((imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        if (next.size >= BULK_DELETE_MAX) return prev;
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const handleLongPressEnterSelection = useCallback(
    (imageId: string) => {
      // 一括削除は未投稿タブのみ対象
      if (!isUnpostedTab) return;
      setSelectionMode(true);
      setSelectedIds((prev) => {
        if (prev.has(imageId)) return prev;
        const next = new Set(prev);
        next.add(imageId);
        return next;
      });
    },
    [isUnpostedTab]
  );

  const handleExecuteDelete = useCallback(async () => {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setIsDeleting(true);
    setPendingDeletionIds(new Set(targetIds));

    try {
      const result = await bulkDeleteMyImages(targetIds, {
        bulkDeleteFailed: t("bulkDeleteFailureTitle"),
      });

      if (result.deleted.length > 0) {
        // 表示から削除分を除外（全タブで使う deletedIds に統合）
        setDeletedIds((prev) => {
          const next = new Set(prev);
          for (const id of result.deleted) next.add(id);
          return next;
        });
      }

      // 成功した分の通知
      if (result.deleted.length > 0 && result.failed.length === 0) {
        toast({
          title: t("bulkDeleteSuccessTitle"),
          description: t("bulkDeleteSuccessDescription", {
            count: result.deleted.length,
          }),
        });
      } else if (result.failed.length > 0 && result.deleted.length > 0) {
        toast({
          variant: "destructive",
          title: t("bulkDeletePartialFailureTitle"),
          description: t("bulkDeletePartialFailureDescription", {
            count: result.failed.length,
          }),
        });
      } else if (result.failed.length > 0 && result.deleted.length === 0) {
        toast({
          variant: "destructive",
          title: t("bulkDeleteFailureTitle"),
          description: t("bulkDeletePartialFailureDescription", {
            count: result.failed.length,
          }),
        });
      }

      // キャッシュ無効化（一覧ページ）。imageId は単体用なのでここでは渡さない。
      try {
        await fetch("/api/revalidate/my-page", { method: "POST" });
      } catch {
        // 無効化に失敗してもユーザー操作はブロックしない
      }
    } catch (err) {
      console.error("Bulk delete failed:", err);
      toast({
        variant: "destructive",
        title: t("bulkDeleteFailureTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("bulkDeleteFailureDescription"),
      });
    } finally {
      setIsDeleting(false);
      setPendingDeletionIds(new Set());
      setConfirmOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [selectedIds, t, toast]);

  // 表示対象の画像をレンダー時に算出（rerender-derived-state-no-effect）
  const rawDisplayImages = useMemo(() => {
    if (filter === "all") {
      return [...initialImages, ...allTabAdditionalImages];
    }
    if (filter === "posted") {
      return postedTab.images;
    }
    return unpostedTab.images;
  }, [
    filter,
    initialImages,
    allTabAdditionalImages,
    postedTab.images,
    unpostedTab.images,
  ]);

  const displayImages = useMemo(
    () =>
      deletedIds.size === 0
        ? rawDisplayImages
        : rawDisplayImages.filter(
            (img) => img.id == null || !deletedIds.has(img.id),
          ),
    [rawDisplayImages, deletedIds]
  );

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

  const selectedCount = selectedIds.size;

  return (
    <div>
      <ImageTabs value={filter} onChange={handleFilterChange} />

      {/* 未投稿タブ・未選択モード時のみ「一括削除」ボタン */}
      {isUnpostedTab && !selectionMode && displayImages.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectionMode(true)}
          >
            {t("bulkDeleteStart")}
          </Button>
        </div>
      )}

      {/*
        選択モード中のヘッダ。`position: sticky; top: 0` で
        初期位置に居つつ、スクロールで画面上端に到達したらその位置に張り付く。
        親要素には overflow を設定していないので body が sticky の基準コンテキストになる。
      */}
      {selectionMode && (
        <div
          role="region"
          aria-label={t("bulkDeleteSelectedCount", { count: selectedCount })}
          className="sticky top-3 z-40 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-md backdrop-blur"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t("bulkDeleteSelectedCount", { count: selectedCount })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("bulkDeleteUnpostedOnlyNote")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exitSelectionMode}
              disabled={isDeleting}
            >
              {t("bulkDeleteCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selectedCount === 0 || isDeleting}
              onClick={() => setConfirmOpen(true)}
            >
              {selectedCount === 0
                ? t("bulkDeleteEmptyAction")
                : t("bulkDeleteActionWithCount", { count: selectedCount })}
            </Button>
          </div>
        </div>
      )}

      {isInitialLoading ? (
        <UserProfilePostsLoadMoreSkeleton />
      ) : (
        <MyImageGallery
          images={displayImages}
          currentUserId={currentUserId}
          loadMoreRef={ref}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          pendingDeletionIds={pendingDeletionIds}
          onToggleSelect={handleToggleSelect}
          onLongPressEnterSelection={
            isUnpostedTab ? handleLongPressEnterSelection : undefined
          }
        />
      )}

      <BulkDeleteConfirmDialog
        open={confirmOpen}
        count={selectedCount}
        isDeleting={isDeleting}
        onConfirm={handleExecuteDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

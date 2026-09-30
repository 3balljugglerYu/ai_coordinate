"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import {
  CatalogTabBar,
  type CatalogTab,
} from "@/features/style-presets/components/CatalogTabBar";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import type { MyImageCatalog } from "@/features/my-page/lib/my-image-catalog";

interface MyPageImageGalleryClientProps {
  initialImages: GeneratedImageRecord[];
  currentUserId?: string | null;
}

const IMAGES_PER_PAGE = 20;

interface ListState {
  images: GeneratedImageRecord[];
  /** 次に読む位置(サーバーから読んだ件数) */
  offset: number;
  hasMore: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  /**
   * 直前の読み込みに失敗した。立っている間は自動で読み直さない
   * (以前は失敗するとすぐ読み直し、失敗が続くあいだ問い合わせを繰り返していた)。
   * 「もう一度読み込む」で下ろすと、そこから読み直す。
   */
  loadFailed: boolean;
}

/** 一覧は「タブ × カタログ」の組み合わせごとに持つ(例: "unposted:persta_original") */
type ListKey = `${ImageFilter}:${MyImageCatalog}`;

/** サーバーでキャッシュした最初の20件(initialImages)を使う組み合わせ */
const INITIAL_LIST_KEY: ListKey = "all:all";

const EMPTY_LIST: ListState = {
  images: [],
  offset: 0,
  hasMore: true,
  isLoading: false,
  hasLoaded: false,
  loadFailed: false,
};

/**
 * カタログのタブの並び(全カタログ / My Catalog / Persta ORIGINAL / User ORIGINAL)と、
 * 空のときの案内の文言キー。
 */
const CATALOG_TABS: {
  id: MyImageCatalog;
  labelKey:
    | "imageCatalogAll"
    | "imageCatalogMyCatalog"
    | "imageCatalogPerstaOriginal"
    | "imageCatalogUserOriginal";
  emptyDescriptionKey:
    | "emptyImagesDescriptionCatalogAll"
    | "emptyImagesDescriptionMyCatalog"
    | "emptyImagesDescriptionPerstaOriginal"
    | "emptyImagesDescriptionUserOriginal";
}[] = [
  {
    id: "all",
    labelKey: "imageCatalogAll",
    emptyDescriptionKey: "emptyImagesDescriptionCatalogAll",
  },
  {
    id: "my_catalog",
    labelKey: "imageCatalogMyCatalog",
    emptyDescriptionKey: "emptyImagesDescriptionMyCatalog",
  },
  {
    id: "persta_original",
    labelKey: "imageCatalogPerstaOriginal",
    emptyDescriptionKey: "emptyImagesDescriptionPerstaOriginal",
  },
  {
    id: "user_original",
    labelKey: "imageCatalogUserOriginal",
    emptyDescriptionKey: "emptyImagesDescriptionUserOriginal",
  },
];

/**
 * クライアントコンポーネント: マイページの画像一覧（タブ別遅延ロード・無限スクロール）
 *
 * カタログ刷新後(`useStylesCatalogRevamp()`。公開前は運営だけ、
 * `NEXT_PUBLIC_USER_STYLES_ENABLED` で全員)は、「すべて / 投稿済み / 未投稿」の下に
 * どのカタログで作ったかのタブ(`/styles` の「すべて・お気に入り・人気」と同じ
 * `CatalogTabBar`)を出し、2つを組み合わせて絞り込む。絞り込みはサーバーで行う
 * (`my-image-catalog.ts`)。一般の利用者はカタログが常に "all" で、これまでと同じ。
 */
export function MyPageImageGalleryClient({
  initialImages,
  currentUserId,
}: MyPageImageGalleryClientProps) {
  const t = useTranslations("myPage");
  const { toast } = useToast();
  const isCatalogRevamp = useStylesCatalogRevamp();
  const [filter, setFilter] = useState<ImageFilter>("all");
  const [selectedCatalog, setSelectedCatalog] = useState<MyImageCatalog>("all");
  // 刷新前は常に "all"(タブも出さない)
  const catalog: MyImageCatalog = isCatalogRevamp ? selectedCatalog : "all";
  const currentKey: ListKey = `${filter}:${catalog}`;

  // 一度開いた組み合わせは、戻ったときに読み直さない。
  // "all:all" の images は initialImages に続けて読んだ分だけを持つ。
  const [lists, setLists] = useState<Partial<Record<ListKey, ListState>>>({});
  // 同じ組み合わせを二重に読みに行かないための印(state の反映を待たずに効かせる)
  const inFlightKeysRef = useRef<Set<ListKey>>(new Set());

  const defaultList = useCallback(
    (key: ListKey): ListState =>
      key === INITIAL_LIST_KEY
        ? {
            images: [],
            offset: initialImages.length,
            hasMore: initialImages.length === IMAGES_PER_PAGE,
            isLoading: false,
            hasLoaded: true,
            loadFailed: false,
          }
        : EMPTY_LIST,
    [initialImages.length]
  );

  const currentList = lists[currentKey] ?? defaultList(currentKey);

  // ===== 一括削除関連の state =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 削除リクエスト中に楽観的にグレーアウトする ID
  const [pendingDeletionIds, setPendingDeletionIds] = useState<Set<string>>(
    new Set()
  );
  // 削除完了済み ID（どのタブ・カタログの組み合わせの表示からも除外）
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isUnpostedTab = filter === "unposted";

  // initialImages が変更されたら「すべて」の追加分をリセット
  useEffect(() => {
    setLists((prev) => {
      if (!(INITIAL_LIST_KEY in prev)) return prev;
      const next = { ...prev };
      delete next[INITIAL_LIST_KEY];
      return next;
    });
  }, [initialImages]);

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const fetchImages = useCallback(
    async (
      filterParam: ImageFilter,
      catalogParam: MyImageCatalog,
      offset: number
    ): Promise<{ images: GeneratedImageRecord[]; hasMore: boolean }> => {
      // カタログは絞るときだけ付ける(一般の利用者のリクエストはこれまでと同じ)
      const catalogQuery =
        catalogParam === "all" ? "" : `&catalog=${catalogParam}`;
      const response = await fetch(
        `/api/my-page/images?filter=${filterParam}&limit=${IMAGES_PER_PAGE}&offset=${offset}${catalogQuery}`
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

  /** 組み合わせの続き(初回は先頭)を読む */
  const loadNext = useCallback(
    async (key: ListKey) => {
      const state = lists[key] ?? defaultList(key);
      if (inFlightKeysRef.current.has(key)) return;
      if (state.hasLoaded && !state.hasMore) return;

      inFlightKeysRef.current.add(key);
      setLists((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? defaultList(key)), isLoading: true },
      }));
      const [filterParam, catalogParam] = key.split(":") as [
        ImageFilter,
        MyImageCatalog,
      ];
      try {
        const { images: newImages, hasMore } = await fetchImages(
          filterParam,
          catalogParam,
          state.offset
        );
        setLists((prev) => {
          const current = prev[key] ?? defaultList(key);
          return {
            ...prev,
            [key]: {
              images: [...current.images, ...newImages],
              offset: current.offset + newImages.length,
              hasMore: newImages.length === 0 ? false : hasMore,
              isLoading: false,
              hasLoaded: true,
              loadFailed: false,
            },
          };
        });
      } catch (error) {
        console.error(`Failed to load images (${key}):`, error);
        setLists((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] ?? defaultList(key)),
            isLoading: false,
            loadFailed: true,
          },
        }));
      } finally {
        inFlightKeysRef.current.delete(key);
      }
    },
    [lists, defaultList, fetchImages]
  );

  // タブ・カタログを切り替えたら、その組み合わせを初めて開くときに読む
  useEffect(() => {
    if (
      !currentList.hasLoaded &&
      !currentList.isLoading &&
      !currentList.loadFailed
    ) {
      loadNext(currentKey);
    }
  }, [
    currentKey,
    currentList.hasLoaded,
    currentList.isLoading,
    currentList.loadFailed,
    loadNext,
  ]);

  // 無限スクロール(同じタブ・カタログの続きを読む)
  useEffect(() => {
    if (!inView) return;
    if (
      currentList.hasLoaded &&
      currentList.hasMore &&
      !currentList.isLoading &&
      !currentList.loadFailed
    ) {
      loadNext(currentKey);
    }
  }, [
    inView,
    currentKey,
    currentList.hasLoaded,
    currentList.hasMore,
    currentList.isLoading,
    currentList.loadFailed,
    loadNext,
  ]);

  /** 失敗の印を下ろす。上の2つの effect が、先頭(未読)か続きを読み直す */
  const retryCurrentList = useCallback(() => {
    setLists((prev) => ({
      ...prev,
      [currentKey]: {
        ...(prev[currentKey] ?? defaultList(currentKey)),
        loadFailed: false,
      },
    }));
  }, [currentKey, defaultList]);

  // タブ・カタログの切り替え時に選択状態をリセット
  const handleFilterChange = useCallback((next: ImageFilter) => {
    setFilter(next);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleCatalogChange = useCallback((next: MyImageCatalog) => {
    setSelectedCatalog(next);
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

    // 後続の finally で使う「次の選択状態」。デフォルトは全クリア＋選択モード終了。
    // 失敗があれば失敗 ID だけ残して選択モードを維持し、ユーザーが再試行しやすくする。
    let nextSelectedIds: Set<string> = new Set();
    let stayInSelectionMode = false;

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

      if (result.failed.length > 0) {
        // 失敗した ID のみを選択状態として残し、選択モードを継続する
        nextSelectedIds = new Set(result.failed);
        stayInSelectionMode = true;
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
      // 例外時は元の選択をそのまま残し、ユーザーが同じ集合を再試行できるようにする
      nextSelectedIds = new Set(targetIds);
      stayInSelectionMode = true;
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
      setSelectionMode(stayInSelectionMode);
      setSelectedIds(nextSelectedIds);
    }
  }, [selectedIds, t, toast]);

  // 表示対象の画像をレンダー時に算出（rerender-derived-state-no-effect）
  const rawDisplayImages = useMemo(
    () =>
      currentKey === INITIAL_LIST_KEY
        ? [...initialImages, ...currentList.images]
        : currentList.images,
    [currentKey, initialImages, currentList.images]
  );

  const displayImages = useMemo(
    () =>
      deletedIds.size === 0
        ? rawDisplayImages
        : rawDisplayImages.filter(
            (img) => img.id == null || !deletedIds.has(img.id),
          ),
    [rawDisplayImages, deletedIds]
  );

  const isLoadingMore = currentList.isLoading;
  const hasMore = currentList.hasMore;
  const isInitialLoading = !currentList.hasLoaded && currentList.isLoading;

  const catalogTabs: CatalogTab<MyImageCatalog>[] = CATALOG_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
  }));
  const activeCatalogTab =
    CATALOG_TABS.find((tab) => tab.id === catalog) ?? CATALOG_TABS[0];

  const selectedCount = selectedIds.size;

  return (
    <div>
      <ImageTabs value={filter} onChange={handleFilterChange} />

      {isCatalogRevamp && (
        <div className="mb-4 -mt-2">
          <CatalogTabBar
            tabs={catalogTabs}
            activeId={catalog}
            onSelect={handleCatalogChange}
            ariaLabel={t("imageCatalogTabsLabel")}
          />
        </div>
      )}

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
      ) : currentList.loadFailed && displayImages.length === 0 ? null : (
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
          emptyTitle={
            isCatalogRevamp && catalog !== "all"
              ? t("emptyCatalogImagesTitle")
              : undefined
          }
          emptyDescription={
            isCatalogRevamp ? t(activeCatalogTab.emptyDescriptionKey) : undefined
          }
        />
      )}

      {/*
        読み込みに失敗したとき。1枚も無ければ「まだ画像がありません」と取り違えないよう
        空の案内の代わりに出し、続きの読み込みで失敗したときは一覧の下に出す。
      */}
      {currentList.loadFailed ? (
        <div
          className="flex flex-col items-center gap-3 py-8"
          role="alert"
          data-testid="my-images-load-failed"
        >
          <p className="text-sm text-gray-500">{t("imageLoadFailed")}</p>
          <Button variant="outline" size="sm" onClick={retryCurrentList}>
            {t("imageLoadRetry")}
          </Button>
        </div>
      ) : null}

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

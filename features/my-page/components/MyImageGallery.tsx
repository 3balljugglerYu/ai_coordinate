"use client";

import Masonry from "react-masonry-css";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { MyImageCard } from "./MyImageCard";
import { UserProfilePostsLoadMoreSkeleton } from "./UserProfilePostsLoadMoreSkeleton";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyImageGalleryProps {
  images: GeneratedImageRecord[];
  currentUserId?: string | null;
  loadMoreRef?: React.Ref<HTMLDivElement | null>;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  /** 選択モード（true のときカードのリンクは無効化されチェックボックスが出る） */
  selectionMode?: boolean;
  /** 選択中の画像 ID */
  selectedIds?: ReadonlySet<string>;
  /** 楽観的削除中の画像 ID（半透明で表示し、操作を抑止する） */
  pendingDeletionIds?: ReadonlySet<string>;
  /** 選択モード中、カードがタップされたとき */
  onToggleSelect?: (imageId: string) => void;
  /** 通常モードで長押しされたとき（選択モードに入る + 対象を即選択） */
  onLongPressEnterSelection?: (imageId: string) => void;
}

export function MyImageGallery({
  images,
  currentUserId,
  loadMoreRef,
  isLoadingMore = false,
  hasMore = false,
  selectionMode = false,
  selectedIds,
  pendingDeletionIds,
  onToggleSelect,
  onLongPressEnterSelection,
}: MyImageGalleryProps) {
  const t = useTranslations("myPage");
  if (images.length === 0) {
    return (
      <Card className="border-dashed p-12">
        <p className="text-center text-sm text-gray-500">
          {t("emptyImagesTitle")}
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          {t("emptyImagesDescription")}
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
        {images.map((image) => {
          const imageId = image.id;
          return (
            <div
              key={imageId}
              className="mb-4 [content-visibility:auto] [contain-intrinsic-size:0_300px]"
            >
              <MyImageCard
                image={image}
                currentUserId={currentUserId}
                selectionMode={selectionMode}
                selected={
                  imageId != null && (selectedIds?.has(imageId) ?? false)
                }
                pendingDeletion={
                  imageId != null &&
                  (pendingDeletionIds?.has(imageId) ?? false)
                }
                onToggleSelect={
                  onToggleSelect && imageId != null
                    ? () => onToggleSelect(imageId)
                    : undefined
                }
                onLongPressEnterSelection={
                  onLongPressEnterSelection && imageId != null
                    ? () => onLongPressEnterSelection(imageId)
                    : undefined
                }
              />
            </div>
          );
        })}
      </Masonry>

      {hasMore && (
        <div ref={loadMoreRef} className="py-4">
          {isLoadingMore && <UserProfilePostsLoadMoreSkeleton />}
        </div>
      )}
    </>
  );
}

"use client";

import Masonry from "react-masonry-css";
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
}

export function MyImageGallery({
  images,
  currentUserId,
  loadMoreRef,
  isLoadingMore = false,
  hasMore = false,
}: MyImageGalleryProps) {
  if (images.length === 0) {
    return (
      <Card className="border-dashed p-12">
        <p className="text-center text-sm text-gray-500">
          まだ画像を生成していません
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          「コーディネート」タブから画像を生成してみましょう
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
        {images.map((image) => (
          <div
            key={image.id}
            className="mb-4 [content-visibility:auto] [contain-intrinsic-size:0_300px]"
          >
            <MyImageCard image={image} currentUserId={currentUserId} />
          </div>
        ))}
      </Masonry>

      {hasMore && (
        <div ref={loadMoreRef} className="py-4">
          {isLoadingMore && <UserProfilePostsLoadMoreSkeleton />}
        </div>
      )}
    </>
  );
}


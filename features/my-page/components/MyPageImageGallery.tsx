"use client";

import { useState, useMemo } from "react";
import { MyImageGallery } from "./MyImageGallery";
import { ImageTabs, type ImageFilter } from "./ImageTabs";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyPageImageGalleryProps {
  initialImages: GeneratedImageRecord[];
  filter: ImageFilter;
  onFilterChange: (filter: ImageFilter) => void;
  onDelete?: (imageId: string) => void;
  currentUserId?: string | null;
}

export function MyPageImageGallery({
  initialImages,
  filter,
  onFilterChange,
  onDelete,
  currentUserId,
}: MyPageImageGalleryProps) {
  const filteredImages = useMemo(() => {
    if (filter === "posted") {
      return initialImages.filter((image) => image.is_posted === true);
    }
    if (filter === "unposted") {
      return initialImages.filter((image) => image.is_posted === false);
    }
    return initialImages;
  }, [initialImages, filter]);

  return (
    <div>
      <ImageTabs value={filter} onChange={onFilterChange} />
      <MyImageGallery
        images={filteredImages}
        onDelete={onDelete}
        currentUserId={currentUserId}
      />
    </div>
  );
}


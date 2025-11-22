"use client";

import { useState } from "react";
import Masonry from "react-masonry-css";
import { Card } from "@/components/ui/card";
import { MyImageCard } from "./MyImageCard";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyImageGalleryProps {
  images: GeneratedImageRecord[];
  onDelete?: (imageId: string) => void;
  currentUserId?: string | null;
}

export function MyImageGallery({
  images,
  onDelete,
  currentUserId,
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
        <div key={image.id} className="mb-4">
          <MyImageCard image={image} currentUserId={currentUserId} />
        </div>
      ))}
    </Masonry>
  );
}


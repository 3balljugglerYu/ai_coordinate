"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MyImageGallery } from "./MyImageGallery";
import { ImageTabs, type ImageFilter } from "./ImageTabs";
import { deleteMyImage } from "../lib/api";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyPageImageGalleryClientProps {
  initialImages: GeneratedImageRecord[];
  currentUserId?: string | null;
}

/**
 * クライアントコンポーネント: マイページの画像一覧（フィルタリング・削除機能付き）
 */
export function MyPageImageGalleryClient({
  initialImages,
  currentUserId,
}: MyPageImageGalleryClientProps) {
  const router = useRouter();
  const [images, setImages] = useState<GeneratedImageRecord[]>(initialImages);
  const [filter, setFilter] = useState<ImageFilter>("all");

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  const filteredImages = useMemo(() => {
    if (filter === "posted") {
      return images.filter((image) => image.is_posted === true);
    }
    if (filter === "unposted") {
      return images.filter((image) => image.is_posted === false);
    }
    return images;
  }, [images, filter]);

  const handleDelete = async (imageId: string) => {
    // 楽観的更新: 削除前の状態を保存
    const previousImages = images;
    
    // 即座にUIから削除
    setImages((prev) => prev.filter((img) => img.id !== imageId));

    try {
      await deleteMyImage(imageId);
      // 削除成功後、サーバーコンポーネントを再レンダリングして統計情報なども更新
      router.refresh();
    } catch (err) {
      // エラー時はロールバック
      setImages(previousImages);
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <div>
      <ImageTabs value={filter} onChange={setFilter} />
      <MyImageGallery
        images={filteredImages}
        onDelete={handleDelete}
        currentUserId={currentUserId}
      />
    </div>
  );
}

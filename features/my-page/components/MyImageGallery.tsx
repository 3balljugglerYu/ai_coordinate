"use client";

import { useState } from "react";
import { Trash2, Eye, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostModal } from "@/features/posts/components/PostModal";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { useRouter } from "next/navigation";

interface MyImageGalleryProps {
  images: GeneratedImageRecord[];
  onDelete?: (imageId: string) => void;
}

export function MyImageGallery({ images, onDelete }: MyImageGalleryProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [postModalImageId, setPostModalImageId] = useState<string | null>(null);

  const handleDelete = async (imageId: string) => {
    if (!confirm("この画像を削除しますか？")) {
      return;
    }

    setDeletingId(imageId);
    try {
      if (onDelete) {
        await onDelete(imageId);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = (imageId: string) => {
    router.push(`/my-page/${imageId}`);
  };

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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <Card key={image.id} className="group relative overflow-hidden">
          {/* 投稿済みバッジ */}
          {image.is_posted && (
            <div className="absolute top-2 left-2 z-10 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white">
              投稿済み
            </div>
          )}

          {/* 投稿ボタン（未投稿の場合のみ） */}
          {!image.is_posted && (
            <Button
              size="sm"
              variant="default"
              className="absolute top-2 right-2 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setPostModalImageId(image.id!);
              }}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}

          <div className="relative flex min-h-[200px] items-center justify-center bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.image_url}
              alt={image.prompt}
              className="h-auto w-full max-h-[300px] object-contain cursor-pointer"
              onClick={() => handleView(image.id!)}
            />
          </div>

          <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/50">
            <div className="flex h-full items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleView(image.id!)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(image.id!)}
                disabled={deletingId === image.id}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-3 border-t">
            <p className="text-xs text-gray-600 line-clamp-2">
              {image.prompt}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(image.created_at!).toLocaleDateString("ja-JP")}
            </p>
          </div>
        </Card>
      ))}
      </div>

      {/* 投稿モーダル */}
      {postModalImageId && (
        <PostModal
          open={!!postModalImageId}
          onOpenChange={(open) => {
            if (!open) setPostModalImageId(null);
          }}
          imageId={postModalImageId}
        />
      )}
    </>
  );
}


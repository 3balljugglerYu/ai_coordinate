"use client";

import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface MyImageCardProps {
  image: GeneratedImageRecord;
  currentUserId?: string | null;
}

export function MyImageCard({ image, currentUserId }: MyImageCardProps) {
  // 画像URLを取得（WebPサムネイル優先、フォールバック付き）
  const imageUrl = getPostThumbUrl({
    storage_path_thumb: image.storage_path_thumb,
    image_url: image.image_url,
    storage_path: image.storage_path,
  });

  // すべての画像を投稿詳細画面へ（遷移元をクエリパラメータで渡す）
  const detailUrl = `/posts/${image.id}?from=my-page`;

  return (
    <Card className="overflow-hidden p-0">
      <Link href={detailUrl} prefetch={false}>
        <div className="relative w-full overflow-hidden bg-gray-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={image.caption || image.prompt || "画像"}
              width={800}
              height={800}
              className="w-full h-auto object-contain transition-transform hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
              unoptimized
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-gray-400">
              画像がありません
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}


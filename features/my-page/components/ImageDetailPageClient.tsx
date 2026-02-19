"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Share2, Loader2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteMyImage } from "@/features/my-page/lib/api";
import { PostModal } from "@/features/posts/components/PostModal";
import { EditPostModal } from "@/features/posts/components/EditPostModal";
import { DeletePostDialog } from "@/features/posts/components/DeletePostDialog";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

interface ImageDetailPageClientProps {
  image: GeneratedImageRecord;
}

export function ImageDetailPageClient({ image }: ImageDetailPageClientProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const handlePost = () => {
    setPostModalOpen(true);
  };

  const handleEdit = () => {
    setEditModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>

          <div className="flex gap-2">
            {!image.is_posted ? (
              <Button onClick={handlePost}>
                <Share2 className="mr-2 h-4 w-4" />
                投稿
              </Button>
            ) : (
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                編集
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              削除
            </Button>
          </div>
        </div>

        {/* モーダル・ダイアログ */}
        <PostModal
          open={postModalOpen}
          onOpenChange={setPostModalOpen}
          imageId={image.id!}
          currentCaption={image.caption}
        />
        <EditPostModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          imageId={image.id!}
          currentCaption={image.caption}
        />
        <DeletePostDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          imageId={image.id!}
          imageUrl={image.image_url}
        />

        {/* 投稿済みバッジ */}
        {image.is_posted && (
          <Card className="mb-4 border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">
              この画像は投稿済みです
            </p>
            {image.posted_at && (
              <p className="mt-1 text-xs text-blue-700">
                投稿日時: {new Date(image.posted_at).toLocaleString("ja-JP")}
              </p>
            )}
          </Card>
        )}

        {/* 画像 */}
        <Card className="mb-6 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.image_url}
            alt={image.prompt}
            className="h-auto w-full object-contain bg-gray-100"
          />
        </Card>

        {/* 詳細情報 */}
        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">画像情報</h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">プロンプト</p>
              <p className="mt-1 text-sm text-gray-600">{image.prompt}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">背景変更</p>
              <p className="mt-1 text-sm text-gray-600">
                {image.background_change ? "あり" : "なし"}
              </p>
            </div>

            {image.caption && (
              <div>
                <p className="text-sm font-medium text-gray-700">キャプション</p>
                <p className="mt-1 text-sm text-gray-600">{image.caption}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700">生成日時</p>
              <p className="mt-1 text-sm text-gray-600">
                {image.created_at
                  ? new Date(image.created_at).toLocaleString("ja-JP")
                  : "-"}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

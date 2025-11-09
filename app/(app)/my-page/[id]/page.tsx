"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Trash2, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getImageDetail, deleteMyImage } from "@/features/my-page/lib/api";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export default function ImageDetailPage() {
  const router = useRouter();
  const params = useParams();
  const imageId = params.id as string;

  const [image, setImage] = useState<GeneratedImageRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadImage();
  }, [imageId]);

  const loadImage = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 認証チェック
      const user = await getCurrentUser();
      if (!user) {
        router.push("/login?next=/my-page");
        return;
      }

      const data = await getImageDetail(imageId);
      setImage(data);
    } catch (err) {
      console.error("Load error:", err);
      setError(err instanceof Error ? err.message : "画像の読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("この画像を削除しますか？投稿済みの場合は投稿も削除されます。")) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteMyImage(imageId);
      alert("画像を削除しました");
      router.push("/my-page");
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePost = () => {
    alert("投稿機能は Phase 4 で実装されます");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="mx-auto max-w-4xl">
          <Card className="border-red-200 bg-red-50 p-6">
            <p className="text-sm text-red-900">{error || "画像が見つかりません"}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/my-page")}
            >
              マイページに戻る
            </Button>
          </Card>
        </div>
      </div>
    );
  }

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
            {!image.is_posted && (
              <Button onClick={handlePost}>
                <Share2 className="mr-2 h-4 w-4" />
                投稿
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
            className="w-full h-auto object-contain bg-gray-100"
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
                {new Date(image.created_at!).toLocaleString("ja-JP")}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}


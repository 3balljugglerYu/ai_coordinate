"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MyImageGallery } from "@/features/my-page/components/MyImageGallery";
import { getMyImages, getCreditBalance, deleteMyImage } from "@/features/my-page/lib/api";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export default function MyPagePage() {
  const router = useRouter();
  const [images, setImages] = useState<GeneratedImageRecord[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 認証チェック
      const user = await getCurrentUser();
      if (!user) {
        router.push("/login?next=/my-page");
        return;
      }

      // データ取得
      const [imagesData, balance] = await Promise.all([
        getMyImages(),
        getCreditBalance(),
      ]);

      setImages(imagesData);
      setCreditBalance(balance);
    } catch (err) {
      console.error("Load error:", err);
      setError(err instanceof Error ? err.message : "データの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    try {
      await deleteMyImage(imageId);
      // 一覧から削除
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-6xl">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">マイページ</h1>
          <p className="mt-2 text-sm text-gray-600">
            あなたが生成した画像の一覧
          </p>
        </div>

        {/* クレジット残高カード */}
        <Card className="mb-8 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">クレジット残高</p>
                <p className="text-2xl font-bold text-gray-900">
                  {creditBalance.toLocaleString()} クレジット
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => alert("クレジット購入機能は Phase 3 で実装されます")}>
              <Plus className="mr-2 h-4 w-4" />
              購入
            </Button>
          </div>
        </Card>

        {/* エラー表示 */}
        {error && (
          <Card className="mb-8 border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-900">{error}</p>
          </Card>
        )}

        {/* 画像一覧 */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              生成画像一覧 ({images.length}枚)
            </h2>
          </div>

          <MyImageGallery images={images} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}


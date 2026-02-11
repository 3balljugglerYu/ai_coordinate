import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { GeneratedImageGalleryWrapper } from "@/features/generation/components/GeneratedImageGalleryWrapper";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationFormSkeleton } from "@/features/generation/components/GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "@/features/generation/components/GeneratedImageGallerySkeleton";

async function GenerationFormWrapper() {
  // 認証チェック
  await requireAuth();

  return <GenerationFormContainer />;
}

export default async function CoordinatePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              コーディネート
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              人物画像をアップロードして、着せ替えを楽しみましょう
            </p>
          </div>

          {/* GenerationForm: Suspenseの外に配置して即座に表示 */}
          <Suspense fallback={<GenerationFormSkeleton />}>
            <GenerationFormWrapper />
          </Suspense>

          {/* 生成結果一覧: 独立したSuspense境界（ストック画像リストと並列実行） */}
          <div className="mt-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              生成結果一覧
            </h2>
            <Suspense fallback={<GeneratedImageGallerySkeleton />}>
              <GeneratedImageGalleryWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

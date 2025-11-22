import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { CoordinatePageContent } from "@/features/generation/components/CoordinatePageContent";
import { CoordinatePageSkeleton } from "@/features/generation/components/CoordinatePageSkeleton";

async function CoordinatePageWrapper() {
  await requireAuth();
  return <CoordinatePageContent />;
}

export default async function CoordinatePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              コーディネート画面
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              人物画像をアップロードして、AIで着せ替えを楽しもう
            </p>
          </div>

          {/* 動的コンテンツ */}
          <Suspense fallback={<CoordinatePageSkeleton />}>
            <CoordinatePageWrapper />
          </Suspense>
        </div>
      </div>
    </div>
  );
}


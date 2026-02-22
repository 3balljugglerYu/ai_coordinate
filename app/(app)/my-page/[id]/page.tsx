import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { CachedImageDetailContent } from "@/features/my-page/components/CachedImageDetailContent";
import { ImageDetailSkeleton } from "@/features/my-page/components/ImageDetailSkeleton";

interface ImageDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ImageDetailPage({ params }: ImageDetailPageProps) {
  const user = await requireAuth();
  const { id: imageId } = await params;

  if (!imageId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return (
    <Suspense fallback={<ImageDetailSkeleton />}>
      <CachedImageDetailContent userId={user.id} imageId={imageId} />
    </Suspense>
  );
}

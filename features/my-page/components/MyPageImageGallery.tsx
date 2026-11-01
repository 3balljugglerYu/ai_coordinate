import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { CachedMyPageImageGallery } from "./CachedMyPageImageGallery";

/** 招待の判定はキャッシュの外で行い、解除後も古い表示権限を使わない。 */
export async function MyPageImageGallery({ userId }: { userId: string }) {
  const catalogReferenceAvailable = await isInI2iCatalogAllowlist(userId);
  return (
    <CachedMyPageImageGallery
      userId={userId}
      catalogReferenceAvailable={catalogReferenceAvailable}
    />
  );
}

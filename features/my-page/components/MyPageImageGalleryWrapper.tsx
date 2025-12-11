import { requireAuth } from "@/lib/auth";
import { getMyImagesServer } from "../lib/server-api";
import { MyPageImageGalleryClient } from "./MyPageImageGalleryClient";

/**
 * サーバーコンポーネント: 画像一覧のデータ取得と表示
 */
export async function MyPageImageGalleryWrapper() {
  const user = await requireAuth();
  // 全画像を取得（フィルタリングはクライアント側で実施）
  const images = await getMyImagesServer(user.id, "all");

  return (
    <MyPageImageGalleryClient
      initialImages={images}
      currentUserId={user.id}
    />
  );
}

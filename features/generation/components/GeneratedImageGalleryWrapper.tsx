import { getUser } from "@/lib/auth";
import { getGeneratedImagesServer } from "../lib/server-database";
import { GeneratedImageGalleryClient } from "./GeneratedImageGalleryClient";
import type { GeneratedImageData } from "../types";

const PAGE_SIZE = 4;

/**
 * サーバーコンポーネント: 生成結果一覧の初期データを取得
 */
export async function GeneratedImageGalleryWrapper() {
  const user = await getUser();
  
  if (!user) {
    return (
      <GeneratedImageGalleryClient initialImages={[]} />
    );
  }

  try {
    const records = await getGeneratedImagesServer(
      user.id,
      PAGE_SIZE,
      0,
      "coordinate"
    );

    // GeneratedImageRecord -> GeneratedImageData 変換
    const initialImages: GeneratedImageData[] = records
      .map((record) => {
        if (!record.id) return null;
        return {
          id: record.id,
          url: record.image_url,
          is_posted: record.is_posted,
        };
      })
      .filter((img): img is GeneratedImageData => img !== null);

    return (
      <GeneratedImageGalleryClient initialImages={initialImages} />
    );
  } catch (error) {
    console.error("[GeneratedImageGalleryWrapper] エラー:", error);
    return (
      <GeneratedImageGalleryClient initialImages={[]} />
    );
  }
}

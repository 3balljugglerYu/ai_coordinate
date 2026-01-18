import { EventImageGalleryClient } from "./EventImageGalleryClient";
import type { EventImageData } from "../types";
import { getEventImagesServer } from "../lib/server-api";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

const PAGE_SIZE = 4;

/**
 * サーバーコンポーネント: イベント画像一覧の初期データを取得
 */
export async function EventImageGalleryWrapper() {
  try {
    const records = await getEventImagesServer(PAGE_SIZE, 0);

    // GeneratedImageRecord -> EventImageData 変換
    const initialImages: EventImageData[] = records
      .map((record) => {
        if (!record.id) return null;
        const imageUrl = getPostThumbUrl({
          storage_path_thumb: record.storage_path_thumb ?? null,
          storage_path: record.storage_path ?? null,
          image_url: record.image_url ?? null,
        });
        return {
          id: record.id,
          url: imageUrl,
          is_posted: record.is_posted ?? false,
        };
      })
      .filter((img): img is EventImageData => img !== null);

    return <EventImageGalleryClient initialImages={initialImages} />;
  } catch (error) {
    console.error("[EventImageGalleryWrapper] エラー:", error);
    return <EventImageGalleryClient initialImages={[]} />;
  }
}

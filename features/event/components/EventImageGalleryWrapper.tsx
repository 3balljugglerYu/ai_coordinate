import { EventImageGalleryClient } from "./EventImageGalleryClient";
import { getEventImagesServer } from "../lib/server-api";
import { EVENT_PAGE_SIZE } from "../lib/constants";
import { convertGeneratedImageRecordsToEventImageData } from "../lib/utils";

/**
 * サーバーコンポーネント: イベント画像一覧の初期データを取得
 */
export async function EventImageGalleryWrapper() {
  try {
    const records = await getEventImagesServer(EVENT_PAGE_SIZE, 0);

    // GeneratedImageRecord -> EventImageData 変換
    const initialImages = convertGeneratedImageRecordsToEventImageData(records);

    return <EventImageGalleryClient initialImages={initialImages} />;
  } catch (error) {
    console.error("[EventImageGalleryWrapper] エラー:", error);
    return <EventImageGalleryClient initialImages={[]} />;
  }
}

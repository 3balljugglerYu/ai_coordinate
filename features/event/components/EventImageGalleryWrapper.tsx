import { EventImageGalleryClient } from "./EventImageGalleryClient";
import { getMaterialPageImages } from "@/features/materials-images/lib/get-material-images";
import { convertMaterialPageImagesToEventImageData } from "../lib/utils";

/**
 * サーバーコンポーネント: フリー素材画像一覧の初期データを取得
 * 管理画面で設定した画像を表示（無限スクロールなし）
 */
export async function EventImageGalleryWrapper() {
  try {
    const materials = await getMaterialPageImages("free-materials");
    const initialImages =
      convertMaterialPageImagesToEventImageData(materials);

    return (
      <EventImageGalleryClient
        initialImages={initialImages}
        initialHasMore={false}
      />
    );
  } catch (error) {
    console.error("[EventImageGalleryWrapper] エラー:", error);
    return (
      <EventImageGalleryClient
        initialImages={[]}
        initialHasMore={false}
      />
    );
  }
}

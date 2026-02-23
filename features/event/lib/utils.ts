/**
 * イベント機能のユーティリティ関数
 */

import type { EventImageData } from "../types";
import type { MaterialPageImage } from "@/features/materials-images/lib/schema";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

/**
 * GeneratedImageRecordをEventImageDataに変換
 * サムネイルURLを取得してイベント画像データ形式に変換
 */
export function convertGeneratedImageRecordToEventImageData(
  record: GeneratedImageRecord
): EventImageData | null {
  if (!record.id) {
    return null;
  }

  // getPostThumbUrlを使用してサムネイルURLを取得
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
}

/**
 * GeneratedImageRecord配列をEventImageData配列に変換
 */
export function convertGeneratedImageRecordsToEventImageData(
  records: GeneratedImageRecord[]
): EventImageData[] {
  return records
    .map(convertGeneratedImageRecordToEventImageData)
    .filter((img): img is EventImageData => img !== null);
}

/**
 * MaterialPageImageをEventImageDataに変換
 * 管理画像は is_posted: true で固定
 */
export function convertMaterialPageImagesToEventImageData(
  images: MaterialPageImage[]
): EventImageData[] {
  return images.map((img) => ({
    id: img.id,
    url: img.image_url,
    is_posted: true,
  }));
}

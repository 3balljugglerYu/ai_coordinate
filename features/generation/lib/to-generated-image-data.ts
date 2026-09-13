import { getImageUrlFromStoragePath } from "@/features/posts/lib/utils";

import type { GeneratedImageData } from "../types";

/**
 * `generated_images` の1行を一覧表示用の形へ直す。
 *
 * 初回取得（`CachedGeneratedImageGallery`）と追加読み込み
 * （`GeneratedImageGalleryClient`）で同じ内容を二重に書いていた。片方だけ直すと
 * 「最初の4枚は軽いが、スクロールで足された分だけ原本のまま」という気づき
 * にくい壊れ方をするので、1箇所に寄せてある。
 */
export interface GeneratedImageRecordForList {
  id?: string | null;
  image_url: string;
  storage_path_display?: string | null;
  is_posted?: boolean | null;
  prompt?: string | null;
  created_at?: string | null;
  model?: GeneratedImageData["model"];
  width?: number | null;
  height?: number | null;
  source_image_stock_id?: string | null;
  pre_generation_storage_path?: string | null;
  show_before_image?: boolean | null;
  source_post_id?: string | null;
}

export function toGeneratedImageData(
  record: GeneratedImageRecordForList
): GeneratedImageData | null {
  if (!record.id) return null;

  return {
    id: record.id,
    /*
      ⭐ `url` は原本（PNG 等・平均 約1.9MB）のまま据え置く。
      ダウンロード（`lib/download-image.ts`）がこれを読むので、表示用に
      差し替えると保存される画像が劣化する。
    */
    url: record.image_url,
    /*
      画面へ出すのはこちら（表示用 WebP・長辺1280px・平均 約137kB）。
      投稿フォームが使う `getPostDisplayUrl` と同じ組み立て方なので URL が
      一致し、画面をまたいでもブラウザが落とし直さない。
      WebP 化の前に作られた古い行と、生成直後でまだ変換が終わっていない行では
      null になるため、読む側は `displayUrl ?? url` で受ける。
    */
    displayUrl: record.storage_path_display
      ? getImageUrlFromStoragePath(record.storage_path_display)
      : null,
    is_posted: record.is_posted ?? false,
    prompt: record.prompt ?? "",
    createdAt: record.created_at ?? undefined,
    model: record.model ?? null,
    width: record.width ?? null,
    height: record.height ?? null,
    fromStock: Boolean(record.source_image_stock_id),
    preGenerationStoragePath: record.pre_generation_storage_path ?? null,
    showBeforeImage: record.show_before_image ?? true,
    sourcePostId: record.source_post_id ?? null,
  } as GeneratedImageData;
}

import { cacheLife, cacheTag } from "next/cache";
import { getGeneratedImagesServer } from "../lib/server-database";
import { GeneratedImageGalleryClient } from "./GeneratedImageGalleryClient";
import type { GeneratedImageData } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 4;

/**
 * 生成結果一覧（use cache でサーバーキャッシュ）
 *
 * 元々 /coordinate 専用だったが、/style など他画面でも同じ UI を再利用するため
 * generationType / cacheTag / title を呼び出し側で指定できるようにしている。
 */

export type GalleryGenerationType =
  | "coordinate"
  | "specified_coordinate"
  | "full_body"
  | "chibi"
  | "one_tap_style";

interface CachedGeneratedImageGalleryProps {
  userId: string;
  /** どの generation_type を一覧に出すか。 */
  generationType: GalleryGenerationType;
  /**
   * use cache のサーバーキャッシュタグ。
   * （生成完了時の revalidateTag と一致させる）
   */
  cacheTag: string;
  /** ヘッダーに出す見出しテキスト。例: "生成結果一覧" */
  title: string;
  /**
   * 「詳細画面へ」リンクの ?from= に付ける値。戻るボタンの遷移先制御に使う。
   * StickyHeader の対応値: "coordinate" | "style" 等。
   */
  detailFromParam: string;
  /**
   * リスト表示の sessionStorage キー（重複回避のためページ単位で別 key）。
   *   - returnToImageIdKey: 詳細画面から戻った時に元のカードへスクロール復帰
   */
  returnToImageIdKey: string;
  /**
   * 「このイラストで生成」ボタンの挙動を制御する。
   *   - "dispatch-event": 同一ページ上の GenerationForm へ apply イベントを発火（/coordinate）
   *   - "navigate-coordinate": 確認ダイアログを出して /coordinate へ遷移し、画像を持ち越す（/style）
   */
  applyActionMode: "dispatch-event" | "navigate-coordinate";
}

export async function CachedGeneratedImageGallery({
  userId,
  generationType,
  cacheTag: cacheTagValue,
  title,
  detailFromParam,
  returnToImageIdKey,
  applyActionMode,
}: CachedGeneratedImageGalleryProps) {
  "use cache";
  cacheTag(cacheTagValue);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const records = await getGeneratedImagesServer(
    userId,
    PAGE_SIZE,
    0,
    generationType,
    supabase
  );

  const initialImages: GeneratedImageData[] = records
    .map((record) => {
      if (!record.id) return null;
      return {
        id: record.id,
        url: record.image_url,
        is_posted: record.is_posted ?? false,
        prompt: record.prompt ?? "",
        createdAt: record.created_at,
        model: record.model ?? null,
        width: record.width ?? null,
        height: record.height ?? null,
        fromStock: Boolean(record.source_image_stock_id),
        preGenerationStoragePath: record.pre_generation_storage_path ?? null,
        showBeforeImage: record.show_before_image ?? true,
      } as GeneratedImageData;
    })
    .filter((img): img is GeneratedImageData => img !== null);

  return (
    <GeneratedImageGalleryClient
      initialImages={initialImages}
      generationType={generationType}
      title={title}
      detailFromParam={detailFromParam}
      returnToImageIdKey={returnToImageIdKey}
      applyActionMode={applyActionMode}
    />
  );
}

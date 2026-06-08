import type { MountLayoutKey } from "./mount-layouts";

/**
 * 手書き型(DB生成型は未使用のため)。get_collection_progress RPC の返却 1 行に対応。
 */
export interface CollectionProgress {
  categoryId: string;
  categoryKey: string;
  displayNameJa: string;
  displayNameEn: string;
  completionThreshold: number;
  uniqueOutfitCount: number;
  isCompleted: boolean;
  mountStatus: "generating" | "completed" | "failed" | null;
  mountImagePath: string | null;
  completedAt: string | null;
  /** 進捗リング中央に表示するシリーズ用キャラ画像の公開URL(無ければ null) */
  characterImageUrl: string | null;
}

/** RPC の生レスポンス行(snake_case) */
export interface CollectionProgressRow {
  category_id: string;
  category_key: string;
  display_name_ja: string;
  display_name_en: string;
  completion_threshold: number;
  unique_outfit_count: number;
  is_completed: boolean;
  mount_status: "generating" | "completed" | "failed" | null;
  mount_image_path: string | null;
  completed_at: string | null;
}

export type MountStatus = "generating" | "completed" | "failed";

/** reserve_collection_completion RPC の返却行 */
export interface ReserveCollectionResultRow {
  completion_id: string;
  mount_status: MountStatus;
  newly_reserved: boolean;
}

/** preset_categories のコレクション設定(必要列のみ) */
export interface CollectionCategorySettings {
  id: string;
  key: string;
  completionThreshold: number;
  mountTemplatePath: string;
  mountLayout: MountLayoutKey;
}

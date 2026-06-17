import type { MountLayoutKey, NormalizedSlotRect } from "./mount-layouts";

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
  /** 集めたシール(衣装ごと最新1枚)の公開URL。display_order 昇順。モーダルのシール一覧用 */
  collectedImageUrls: string[];
  /**
   * 完了台紙の collection_completions.id(mount完成済みのみ。それ以外は null)。
   * フィード側の完了モーダルでシェア導線(台紙シェア/シェアページ)を出すのに使う。
   */
  completionId: string | null;
  /** 台紙テンプレ実寸(px)。完了モーダルの表示アスペクト算出用。無ければ null */
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
  /**
   * 進捗モーダル(CollectionProgressModal)の DB 駆動レイアウト用。
   * progressModalFrameUrl が設定されたカテゴリだけがモーダルを DB 駆動で描画し、
   * 未設定なら従来どおりハードコード MODAL_LAYOUTS にフォールバックする。
   */
  progressModalFrameUrl: string | null;
  progressModalFrameWidth: number | null;
  progressModalFrameHeight: number | null;
  progressModalSlots: NormalizedSlotRect[] | null;
  progressModalButton: NormalizedSlotRect | null;
  /**
   * 進捗モーダル中央画像の位置(正規化矩形)。表示する画像は characterImageUrl
   * (= collection_character_path)を流用する。位置だけを admin がここで設定する。
   */
  progressModalCenter: NormalizedSlotRect | null;
  /**
   * 進捗リング・%達成バッジの色(#RRGGBB)。null なら従来デフォルト配色
   * (オレンジのリング/ゴールドのバッジ)を使う。
   */
  progressModalRingColor: string | null;
  progressModalBadgeColor: string | null;
  /**
   * %達成バッジの文字色・内側背景色(#RRGGBB)。null なら従来デフォルト配色
   * (% はオレンジ/達成！は茶/背景はクリーム)を使う。
   */
  progressModalBadgeTextColor: string | null;
  progressModalBadgeBgColor: string | null;
  /**
   * 進捗モーダル下部 CTA ボタンの塗り色・文字色(#RRGGBB)。null なら従来配色
   * (オレンジ地/白文字)を使う。
   */
  progressModalButtonColor: string | null;
  progressModalButtonTextColor: string | null;
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

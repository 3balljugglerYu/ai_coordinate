import {
  isCollectionDisplayPeriodActive,
} from "@/features/collections/lib/collection-display-period";
import type { StylePresetStatus } from "@/features/style-presets/lib/schema";

/**
 * 「公開中でないプリセットに紐づく利用イベント(style_usage_events)は記録しない」
 * ための共有述語。admin の公開前テスト生成が「これまでに◯◯回つくられました」
 * (プリセット別カウンタ)や /style 上部の総生成数・KPI 集計に乗るのを防ぐ。
 *
 * 判定条件はクリエイター通知の記録ゲート(#479 / 20260805120000 の
 * record_style_preset_usage)と同一:
 *   status='published' × カテゴリ visibility='public' × is_active
 *   × コレクション表示期間 [starts, ends) 内
 *
 * status を持たない型(StylePresetPublicSummary)は published のみが流通する
 * 前提のため、status 未定義は published とみなす。
 */
export function shouldRecordStylePresetUsage(preset: {
  status?: StylePresetStatus;
  category: {
    visibility: string;
    isActive: boolean;
    /** 未指定(undefined)は「期間制限なし」として扱う(NULL と同じ)。 */
    collectionDisplayStartsAt?: string | null;
    collectionDisplayEndsAt?: string | null;
  };
}): boolean {
  if (preset.status !== undefined && preset.status !== "published") {
    return false;
  }
  const category = preset.category;
  if (category.visibility !== "public") {
    return false;
  }
  if (!category.isActive) {
    return false;
  }
  return isCollectionDisplayPeriodActive({
    collectionDisplayStartsAt: category.collectionDisplayStartsAt ?? null,
    collectionDisplayEndsAt: category.collectionDisplayEndsAt ?? null,
  });
}

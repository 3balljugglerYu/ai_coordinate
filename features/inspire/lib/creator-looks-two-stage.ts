/**
 * Creator Looks「2段階(衣装＋背景)生成モード」の公開レベル(グローバル設定)。
 *
 * - app_settings.key = 'creator_looks_two_stage_visibility'
 *   - 'admin_only' : admin / プレビュー権限のユーザーにのみ表示・利用可(= 既定・未公開)
 *   - 'public'     : Creator Looks 利用可ユーザー全員に表示・利用可
 *
 * 設計: docs/planning/creator-looks-generation-modes-plan.md (ADR-006)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TWO_STAGE_VISIBILITY_KEY = "creator_looks_two_stage_visibility";

export const TWO_STAGE_VISIBILITY_VALUES = ["admin_only", "public"] as const;
export type TwoStageVisibility = (typeof TWO_STAGE_VISIBILITY_VALUES)[number];

export const DEFAULT_TWO_STAGE_VISIBILITY: TwoStageVisibility = "admin_only";

/** 任意値を TwoStageVisibility に解釈する。'public' 以外はすべて admin_only(安全側)。 */
export function parseTwoStageVisibility(value: unknown): TwoStageVisibility {
  return value === "public" ? "public" : DEFAULT_TWO_STAGE_VISIBILITY;
}

/**
 * 2段階(衣装＋背景)モードが、そのユーザーに表示/利用可能か。
 * - public      : 全員可
 * - admin_only  : admin(またはプレビュー権限)のみ可
 */
export function isTwoStageModeAvailable(
  visibility: TwoStageVisibility,
  isAdmin: boolean,
): boolean {
  return visibility === "public" || isAdmin;
}

/**
 * app_settings から公開レベルを読む(service_role / admin client 推奨)。
 * テーブル未作成・行なし・エラー時は admin_only(未公開)へ安全フォールバックする。
 */
export async function getCreatorLooksTwoStageVisibility(
  client: SupabaseClient,
): Promise<TwoStageVisibility> {
  try {
    const { data, error } = await client
      .from("app_settings")
      .select("value")
      .eq("key", TWO_STAGE_VISIBILITY_KEY)
      .maybeSingle();
    if (error) return DEFAULT_TWO_STAGE_VISIBILITY;
    return parseTwoStageVisibility(data?.value);
  } catch {
    return DEFAULT_TWO_STAGE_VISIBILITY;
  }
}

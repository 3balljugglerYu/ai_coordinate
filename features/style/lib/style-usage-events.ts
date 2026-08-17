import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type StyleUsageEventType =
  | "visit"
  | "generate_attempt"
  | "generate"
  | "download"
  | "rate_limited"
  | "signup_click"
  | "wardrobe_save_click"
  | "wardrobe_save_completed"
  // コレクション(集めてコンプリート)系。complete_achieved / mount_generated は
  // server 側でのみ記録。mount_shared は公開ページURLのシェア時に発火する。
  | "complete_achieved"
  | "mount_generated"
  | "mount_shared";
// client から直接送信を許可する公開イベント。wardrobe_save_completed は
// claim 成功時に server 側でのみ記録するため含めない。
export type StylePublicUsageEventType =
  | "visit"
  | "download"
  | "generate"
  | "signup_click"
  | "wardrobe_save_click";
export type StyleUsageAuthState = "authenticated" | "guest";

export interface RecordStyleUsageEventInput {
  userId: string | null;
  authState: StyleUsageAuthState;
  eventType: StyleUsageEventType;
  styleId?: string | null;
  /**
   * 企画(preset_categories.key)単位の集計キー。style_id とは独立に持つ。
   * これが無いと visit のように style_id を持たないイベントを企画別に数えられない。
   */
  categoryKey?: string | null;
  /**
   * ユニーク視聴者キー(`u:<user_id>` / `g:<ip_hash>`)。
   * **サーバー側でのみ解決すること**(body から受け取ると偽装できる)。
   * IP が取れないゲストは null のままで、UU には数えない。
   */
  viewerKey?: string | null;
}

/**
 * 注意: styleId を伴うイベントを新しい経路から記録する場合は、記録前に
 * `shouldRecordStylePresetUsage`(features/style-presets/lib/style-preset-usage-recording)
 * を通すこと。公開中でないプリセット(admin の公開前テスト等)のイベントが
 * 「◯◯回つくられました」カウンタや KPI 集計に混入するのを防ぐゲートで、
 * 既存経路(/style/events・/style/generate)は適用済み。
 */
export async function recordStyleUsageEvent({
  userId,
  authState,
  eventType,
  styleId = null,
  categoryKey = null,
  viewerKey = null,
}: RecordStyleUsageEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("style_usage_events").insert({
    user_id: userId,
    auth_state: authState,
    event_type: eventType,
    style_id: styleId,
    category_key: categoryKey,
    viewer_key: viewerKey,
  });

  if (error) {
    throw error;
  }
}

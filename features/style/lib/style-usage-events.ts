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
}

export async function recordStyleUsageEvent({
  userId,
  authState,
  eventType,
  styleId = null,
}: RecordStyleUsageEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("style_usage_events").insert({
    user_id: userId,
    auth_state: authState,
    event_type: eventType,
    style_id: styleId,
  });

  if (error) {
    throw error;
  }
}

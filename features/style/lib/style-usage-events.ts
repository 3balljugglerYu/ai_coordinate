import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type StyleUsageEventType =
  | "visit"
  | "generate"
  | "download"
  | "rate_limited";
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

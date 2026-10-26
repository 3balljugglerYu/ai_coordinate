import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MonetizationEventType, MonetizationFeature } from "./monetization-event-types";

/**
 * 課金の手前の出来事を1行書く(RPC record_monetization_event)。
 *
 * ⚠️ 失敗しても投げない。ログに残して false を返す。生成や支払いの本来の処理を、
 * 記録のせいで止めないため。回数の上限(同じ人の1分に10件)と、
 * 同じ支払い画面の2回目は、DB の側で止める(そのときも false)。
 */
export interface MonetizationEventRecord {
  userId: string;
  eventType: MonetizationEventType;
  feature?: MonetizationFeature | null;
  whereDetected?: "client" | "server" | null;
  origin?: string | null;
  product?: string | null;
  required?: number | null;
  balance?: number | null;
  stripeSessionId?: string | null;
}

export async function recordMonetizationEvent(
  event: MonetizationEventRecord,
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase.rpc("record_monetization_event", {
      p_user_id: event.userId,
      p_event_type: event.eventType,
      p_feature: event.feature ?? null,
      p_where_detected: event.whereDetected ?? null,
      p_origin: event.origin ?? null,
      p_product: event.product ?? null,
      p_required: event.required ?? null,
      p_balance: event.balance ?? null,
      p_stripe_session_id: event.stripeSessionId ?? null,
    });
    if (error) {
      console.error("[monetization-events] record failed:", error.message, event.eventType);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error("[monetization-events] record threw:", error, event.eventType);
    return false;
  }
}

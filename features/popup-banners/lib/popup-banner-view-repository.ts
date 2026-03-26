import type { SupabaseClient } from "@supabase/supabase-js";
import type { PopupBannerViewRecord } from "./schema";

export async function listPopupBannerViewHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<PopupBannerViewRecord[]> {
  const { data, error } = await supabase
    .from("popup_banner_views")
    .select(
      "popup_banner_id, action_type, permanently_dismissed, reshow_after, updated_at"
    )
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? []) as PopupBannerViewRecord[];
}

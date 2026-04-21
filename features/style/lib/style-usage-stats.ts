import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const STYLE_USAGE_STATS_CACHE_TAG = "style-usage-stats";
export const STYLE_TOTAL_GENERATION_COUNT_START_AT =
  "2026-04-15T00:00:00+09:00";

async function fetchTotalStyleGenerateCount(): Promise<number> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from("style_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "generate")
    .gte("created_at", STYLE_TOTAL_GENERATION_COUNT_START_AT);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getTotalStyleGenerateCount(): Promise<number> {
  "use cache";
  cacheTag(STYLE_USAGE_STATS_CACHE_TAG);
  cacheLife("minutes");

  return fetchTotalStyleGenerateCount();
}

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const STYLE_POPULARITY_CACHE_TAG = "style-popularity";

/** 「👑人気」の集計窓(日)。直近の盛り上がりを反映しつつ企画終了後も急落しない値。 */
export const STYLE_POPULARITY_WINDOW_DAYS = 30;

/** 「利用回数」表示用の累計窓(日)。実質全期間(サービス開始以前まで遡る)。 */
export const STYLE_TOTAL_WINDOW_DAYS = 36500;

/**
 * プリセットID -> 直近 STYLE_POPULARITY_WINDOW_DAYS 日の生成数(plain object)。
 *
 * style_usage_events は RLS 全拒否のため、service_role 専用 RPC
 * get_style_generate_counts を admin client で呼ぶ(DB側 GROUP BY・行上限非依存)。
 * 全ユーザー共通のグローバル指標なので "use cache" でまとめてキャッシュする
 * (キャッシュ直列化のため Map でなく Record を返す)。
 * 取得失敗時は空(=人気順なし・非致命)にフォールバックする。
 */
export async function getStyleGenerateCounts(): Promise<
  Record<string, number>
> {
  "use cache";
  cacheTag(STYLE_POPULARITY_CACHE_TAG);
  cacheLife("hours");

  return fetchStyleGenerateCounts(STYLE_POPULARITY_WINDOW_DAYS);
}

/**
 * プリセットID -> 累計生成数(実質全期間)。探索シートの「これまでに◯回」表示用。
 * 人気(30日窓)とは別窓なので別キャッシュエントリになる。
 */
export async function getStyleGenerateTotalCounts(): Promise<
  Record<string, number>
> {
  "use cache";
  cacheTag(STYLE_POPULARITY_CACHE_TAG);
  cacheLife("hours");

  return fetchStyleGenerateCounts(STYLE_TOTAL_WINDOW_DAYS);
}

async function fetchStyleGenerateCounts(
  days: number,
): Promise<Record<string, number>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_style_generate_counts", {
      p_days: days,
    });
    if (error) {
      console.error("[style-popularity] rpc failed:", error);
      return {};
    }
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{
      style_id: string | null;
      generate_count: number | null;
    }>) {
      if (row.style_id) {
        counts[row.style_id] = Number(row.generate_count) || 0;
      }
    }
    return counts;
  } catch (error) {
    console.error("[style-popularity] unexpected error:", error);
    return {};
  }
}

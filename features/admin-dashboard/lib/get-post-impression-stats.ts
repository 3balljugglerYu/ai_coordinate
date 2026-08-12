import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import {
  parseImpressionStats,
  type ImpressionDailyPoint,
  type ImpressionTotals,
} from "./build-impression-stats";
import { getRangeBounds, type DashboardRange } from "./dashboard-range";

/**
 * 投稿インプレッションの期間集計を取る。
 *
 * 集計は SQL の `get_post_impression_stats` に寄せている。90日分だと数万行になり、
 * PostgREST の行上限に当たるうえ、期間のユニーク視聴者数は日次の合計では出せない
 * (同じ人が複数日に跨るため)。行を引いて TS で畳む形にはしない。
 *
 * `post_impressions` は RLS 全拒否なので service role で読む。
 */

export interface ImpressionTopPost {
  imageId: string;
  impressions: number;
  uniqueViewers: number;
  thumbUrl: string;
  authorName: string;
  postedAt: string | null;
}

export interface PostImpressionStats {
  totals: ImpressionTotals;
  daily: ImpressionDailyPoint[];
  topPosts: ImpressionTopPost[];
}

const EMPTY_STATS: PostImpressionStats = {
  totals: {
    impressions: 0,
    uniqueViewers: 0,
    uniquePosts: 0,
    grid: 0,
    feed: 0,
    detail: 0,
    unknown: 0,
    authenticated: 0,
    guest: 0,
    averagePerPost: 0,
  },
  daily: [],
  topPosts: [],
};

const TOP_POST_LIMIT = 10;

export async function getPostImpressionStats(
  range: DashboardRange
): Promise<PostImpressionStats> {
  try {
    const bounds = getRangeBounds(range);
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_post_impression_stats", {
      p_from: bounds.currentStartIso,
      p_to: bounds.nowIso,
      p_top_limit: TOP_POST_LIMIT,
    });

    if (error) {
      console.error("[admin impression stats] RPC failed:", error);
      return EMPTY_STATS;
    }

    const { daily, totals, topPostRefs } = parseImpressionStats(data);

    if (topPostRefs.length === 0) {
      return { totals, daily, topPosts: [] };
    }

    // サムネイルと作者名は集計とは別に引く。URL 生成を SQL に写すと
    // getPostThumbUrl のフォールバック(thumb→display→原本)と二重管理になる。
    const imageIds = topPostRefs.map((ref) => ref.imageId);
    const { data: imageRows, error: imageError } = await supabase
      .from("generated_images")
      .select(
        "id, user_id, posted_at, storage_path_thumb, storage_path, image_url"
      )
      .in("id", imageIds);

    if (imageError) {
      console.error("[admin impression stats] image fetch failed:", imageError);
      return { totals, daily, topPosts: [] };
    }

    const imageMap = new Map(
      ((imageRows ?? []) as Array<{
        id: string;
        user_id: string | null;
        posted_at: string | null;
        storage_path_thumb: string | null;
        storage_path: string | null;
        image_url: string | null;
      }>).map((row) => [row.id, row] as const)
    );

    const userIds = Array.from(
      new Set(
        Array.from(imageMap.values())
          .map((row) => row.user_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    const profilesResult =
      userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, nickname")
            .in("user_id", userIds)
        : { data: [], error: null };

    if (profilesResult.error) {
      console.error(
        "[admin impression stats] profile fetch failed:",
        profilesResult.error
      );
    }

    const nicknameMap = new Map<string, string | null>(
      ((profilesResult.data ?? []) as Array<{
        user_id: string;
        nickname: string | null;
      }>).map((profile) => [profile.user_id, profile.nickname ?? null] as const)
    );

    const topPosts: ImpressionTopPost[] = topPostRefs.flatMap((ref) => {
      const image = imageMap.get(ref.imageId);
      // 集計後に削除された投稿は落とす(数字だけ残っても辿れない)
      if (!image) {
        return [];
      }
      const nickname = image.user_id ? nicknameMap.get(image.user_id) : null;
      return [
        {
          imageId: ref.imageId,
          impressions: ref.impressions,
          uniqueViewers: ref.uniqueViewers,
          thumbUrl: getPostThumbUrl(image),
          authorName: nickname || image.user_id?.slice(0, 8) || "不明",
          postedAt: image.posted_at,
        },
      ];
    });

    return { totals, daily, topPosts };
  } catch (error) {
    // ダッシュボード全体を落とさない。ここが欠けても他のKPIは見たい
    console.error("[admin impression stats] unexpected error:", error);
    return EMPTY_STATS;
  }
}

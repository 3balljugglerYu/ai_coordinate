import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 企画の横並び比較(Phase 6)。
 *
 * 今は1企画ずつしか見られず、「8ページは長すぎたか」に答えられない。
 * 手集計では完走率がページ数と逆相関していた(6ページ企画 80.0% / 94.4% に対し
 * 8〜9ページ企画 64.5% / 75.0%)。次回の会期とページ数を決める材料になる。
 *
 * **会期ではなくカテゴリ単位の通算**を返す。企画ごとに会期の定義が揺れており
 * (神コレは表示期間より前から生成が始まっている)、会期で切ると比較にならない。
 *
 * ## キャッシュ(ADR-008)
 *
 * ここだけキャッシュする。単一企画のビューは「今動いている企画」を見るので
 * 鮮度が要るが、通算値は分単位で変わるものではない。全企画×全期間の集計を
 * 毎回走らせる理由がない。画面には「最終更新」を出して古さを明示する。
 */

export const COLLECTION_SUMMARIES_CACHE_TAG = "admin-collection-summaries";

export interface CollectionCampaignSummary {
  categoryKey: string;
  displayName: string;
  pageCount: number;
  displayStartsAt: string | null;
  displayEndsAt: string | null;
  generations: number;
  generatorUu: number;
  completerUu: number;
  shareUu: number;
  firstGenerationAt: string | null;
  lastGenerationAt: string | null;
  /** 完走率(完走UU / 生成UU)。生成UUが0なら null */
  completionRatePct: number | null;
}

export interface CollectionCampaignSummaries {
  items: CollectionCampaignSummary[];
  /** 集計時刻。キャッシュしているので画面で古さを示す */
  generatedAt: string;
}

type SummaryRow = {
  category_key: string;
  display_name: string | null;
  page_count: number;
  display_starts_at: string | null;
  display_ends_at: string | null;
  generations: number;
  generator_uu: number;
  completer_uu: number;
  share_uu: number;
  first_generation_at: string | null;
  last_generation_at: string | null;
};

/**
 * @param operatorUserIds 除外する運営。**キャッシュキーの一部になる**ため、
 *   呼び出し側は必ず安定した順序で渡すこと(`getOperatorUserIds` は整列済み)。
 */
export async function getCollectionCampaignSummaries(
  operatorUserIds: string[],
): Promise<CollectionCampaignSummaries> {
  "use cache";
  cacheTag(COLLECTION_SUMMARIES_CACHE_TAG);
  cacheLife("minutes");

  return resolveCollectionCampaignSummaries(operatorUserIds);
}

/** キャッシュを挟まない解決本体。 */
async function resolveCollectionCampaignSummaries(
  operatorUserIds: string[],
): Promise<CollectionCampaignSummaries> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    "get_collection_campaign_summaries",
    { p_exclude_user_ids: operatorUserIds },
  );

  if (error) {
    console.error("[collection summaries] rpc failed:", error);
    // 比較表が出ないだけで単一企画のビューは描ける
    return { items: [], generatedAt };
  }

  const rows = (data ?? []) as SummaryRow[];

  return {
    generatedAt,
    items: rows.map((row) => ({
      categoryKey: row.category_key,
      displayName: row.display_name ?? row.category_key,
      pageCount: row.page_count,
      displayStartsAt: row.display_starts_at,
      displayEndsAt: row.display_ends_at,
      generations: row.generations,
      generatorUu: row.generator_uu,
      completerUu: row.completer_uu,
      shareUu: row.share_uu,
      firstGenerationAt: row.first_generation_at,
      lastGenerationAt: row.last_generation_at,
      completionRatePct:
        row.generator_uu > 0
          ? Math.round((row.completer_uu / row.generator_uu) * 1000) / 10
          : null,
    })),
  };
}

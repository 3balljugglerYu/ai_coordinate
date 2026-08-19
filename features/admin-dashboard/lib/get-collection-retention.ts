import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 会期終了後の継続(Phase 4)。
 *
 * 企画の価値判断の本丸。手集計では
 * 「完走者は 42.1% が戻るが、会期中に登録した18名は1人も戻っていない」
 * が見え、これが今回いちばん重い数字だった。今のダッシュボードには一切無い。
 *
 * 集計は SQL RPC に寄せている(参加者リストを跨ぐため取得行数が読めない)。
 */

export interface CollectionRetentionCohort {
  generatorUu: number;
  generatorReturned: number;
  completerUu: number;
  completerReturned: number;
  registeredUu: number;
  registeredReturned: number;
  /** 観測時点。会期終了からの経過日数を出すのに使う */
  observedUntil: string;
  /** 会期終了からの経過日数。7日未満なら暫定値として扱う */
  daysSinceEnd: number;
  /** 会期がまだ終わっていない(=継続を語れない) */
  isCampaignOngoing: boolean;
}

/** 継続率を語るのに最低限ほしい観測日数。これ未満は「暫定」と明示する。 */
export const RETENTION_PROVISIONAL_DAYS = 7;

type RetentionRow = {
  generator_uu: number;
  generator_returned: number;
  completer_uu: number;
  completer_returned: number;
  registered_uu: number;
  registered_returned: number;
  observed_until: string;
};

export async function getCollectionRetention(params: {
  categoryKey: string;
  rangeStart: Date;
  rangeEnd: Date;
  operatorUserIds: string[];
}): Promise<CollectionRetentionCohort | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("get_collection_retention_cohort", {
    p_category_key: params.categoryKey,
    p_start: params.rangeStart.toISOString(),
    p_end: params.rangeEnd.toISOString(),
    p_exclude_user_ids: params.operatorUserIds,
  });

  if (error) {
    // このセクションだけ落とす。ダッシュボード全体を巻き添えにしない
    console.error("[collection retention] rpc failed:", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as RetentionRow | undefined;
  if (!row) return null;

  const observedUntil = row.observed_until;
  const elapsedMs =
    Date.parse(observedUntil) - params.rangeEnd.getTime();
  const daysSinceEnd = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));

  return {
    generatorUu: row.generator_uu,
    generatorReturned: row.generator_returned,
    completerUu: row.completer_uu,
    completerReturned: row.completer_returned,
    registeredUu: row.registered_uu,
    registeredReturned: row.registered_returned,
    observedUntil,
    daysSinceEnd,
    /*
      集計期間の終端が「今」まで伸びている = 会期が終わっていない。
      開催中に「継続率0%」と出すと、終わってもいないのに失敗したように読める。
      resolveCampaignPeriod が終端を今に切り詰めるので、差がほぼ0なら開催中。
    */
    isCampaignOngoing: elapsedMs < 60 * 60 * 1000,
  };
}

/**
 * 見本(参照画像)つきのカタログで、ジョブが使う見本を課金の前に解決する。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・Phase 5・ADR-003)
 *
 * - 作者が自分の見本で生成するジョブ(catalog_reference_id あり)と、派生生成のジョブ(origin_post_id あり)で呼ぶ
 * - 持ち主・使える人の一覧・作り直し・元の作品の審査の状態は、DB の resolve_catalog_reference_for_job が確かめる
 * - 使えないときは CATALOG_REFERENCE_UNAVAILABLE を投げる(課金の前・再試行しない・理由は分けない)
 * - 見本の無い派生生成は null(今までどおり生成する)
 * - 見本を使えるのはじゆうモードだけ(受付でも止めている)
 * - 返す場所はメモリの中だけで使い、job・ログ・応答には書かない
 */

export const CATALOG_REFERENCE_UNAVAILABLE = "CATALOG_REFERENCE_UNAVAILABLE";

export interface CatalogReferenceForJob {
  storagePath: string;
  takes: string[];
}

interface CatalogReferenceRpcClient {
  rpc: (
    fn: "resolve_catalog_reference_for_job",
    args: { p_job_id: string },
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

export async function resolveCatalogReferenceForJob(
  supabase: CatalogReferenceRpcClient,
  job: {
    id: string;
    generation_type: string;
    catalog_reference_id?: string | null;
    origin_post_id?: string | null;
  },
  logError: (message: string, detail: Record<string, unknown>) => void,
): Promise<CatalogReferenceForJob | null> {
  const usesOwnReference = job.catalog_reference_id != null;
  if (!usesOwnReference && job.origin_post_id == null) {
    return null;
  }

  const { data, error } = await supabase.rpc("resolve_catalog_reference_for_job", {
    p_job_id: job.id,
  });
  if (error) {
    // 理由は返さない。場所が入りうるので error を丸ごとログに出さない
    logError("[Job Processing] Catalog reference unavailable", {
      jobId: job.id,
      code: error.code,
    });
    throw new Error(CATALOG_REFERENCE_UNAVAILABLE);
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | { storage_path?: string | null; takes?: string[] | null }
    | null;
  if (!row?.storage_path) {
    // 自分の見本を指しているのに見本が引けないのはおかしい(作り直し・消された)
    if (usesOwnReference) {
      throw new Error(CATALOG_REFERENCE_UNAVAILABLE);
    }
    return null;
  }

  if (job.generation_type !== "free") {
    throw new Error(CATALOG_REFERENCE_UNAVAILABLE);
  }

  return { storagePath: row.storage_path, takes: row.takes ?? [] };
}

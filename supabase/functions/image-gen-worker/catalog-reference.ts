/**
 * 見本(参照画像)つきのカタログで、ジョブが使う見本を課金の前に解決する。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・Phase 5・ADR-003)
 *
 * - 作者が自分の見本で生成するジョブ(catalog_reference_id あり)と、派生生成のジョブ(origin_post_id あり)で呼ぶ
 * - 持ち主・使える人の一覧・作り直し・元の作品の審査の状態は、DB の resolve_catalog_reference_for_job が確かめる
 * - 使えないとき(RPC が例外 P0001 で断った)は CATALOG_REFERENCE_UNAVAILABLE を投げる(課金の前・再試行しない・
 *   理由は分けない)。DB の一時的な失敗(それ以外のエラー)は CATALOG_REFERENCE_CHECK_FAILED を投げ、
 *   ふつうの失敗としてやり直させる(見本の無い派生生成まで、一時的な失敗で確定の失敗にしない)
 * - 見本の無い派生生成は null(今までどおり生成する)
 * - 見本を使えるのはじゆうモードだけ(受付でも止めている)
 * - 返す場所はメモリの中だけで使い、job・ログ・応答には書かない
 */

export const CATALOG_REFERENCE_UNAVAILABLE = "CATALOG_REFERENCE_UNAVAILABLE";
export const CATALOG_REFERENCE_CHECK_FAILED = "CATALOG_REFERENCE_CHECK_FAILED";

export interface CatalogReferenceForJob {
  storagePath: string;
  takes: string[];
}

interface CatalogReferenceRpcClient {
  rpc: (
    fn: "resolve_catalog_reference_for_job",
    args: { p_job_id: string },
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
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
    logError("[Job Processing] Catalog reference check failed", {
      jobId: job.id,
      code: error.code,
    });
    // RPC が RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE' で断ったときだけ確定の失敗にする。
    // P0001 は ERRCODE を付けない RAISE すべての既定なので、断りの文でも確かめる
    const refused =
      error.code === "P0001" && (error.message ?? "").startsWith(CATALOG_REFERENCE_UNAVAILABLE);
    throw new Error(refused ? CATALOG_REFERENCE_UNAVAILABLE : CATALOG_REFERENCE_CHECK_FAILED);
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

  // 見本を使えるのはじゆうモードだけ。まねるものが無い見本は指示の無い2枚目の画像になるので使わない
  if (job.generation_type !== "free" || !row.takes || row.takes.length === 0) {
    throw new Error(CATALOG_REFERENCE_UNAVAILABLE);
  }

  return { storagePath: row.storage_path, takes: row.takes };
}

/**
 * 作者の本文が無いことを、失敗(プロンプトが取れない)とみなすか。
 * 見本つきのカタログ(「イラストから」)は、本文なしで作れる(本文は空文字で残る)。
 * そのため、見本を解決できたジョブ(作者の見本のジョブと、見本つきの作品からの派生生成)だけ、空文字を許す。
 * 本文の行そのものが無い(null)ときは、見本があっても失敗にする
 */
export function isAuthorInputMissing(
  authorInput: string | null | undefined,
  hasCatalogReference: boolean,
): boolean {
  if (authorInput === null || authorInput === undefined) {
    return true;
  }
  return authorInput === "" && !hasCatalogReference;
}

/**
 * 指示文の本文(User's Direction)として渡すものを作る。作者の本文のあとに、見本の指示文(buildCatalogReferenceDirective)を続ける。
 * User's Direction は組み立てた指示文の最後なので、後ろに足すのと同じ文になる。本文と同じく消毒(sanitizeUserInput)を通る。
 * 本文なしの見本つき(「イラストから」)では、見本の指示文だけが本文になる
 * (錨の「User's Direction に従い、触れていないものは image_0 のまま」とぶつからないようにするため)
 */
export function composeCatalogReferenceDescription(authorInput: string, directive: string): string {
  return [authorInput, directive].filter((part) => part.trim() !== "").join("\n\n");
}

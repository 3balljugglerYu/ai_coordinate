/**
 * 生成実行入力 (generation_prompt_snapshots) の解決。
 *
 * プロンプト本文は `anon` にも開放されている `generated_images` や、
 * 本人が全列を読める `image_jobs` には置かず、service-only のこのテーブル
 * だけに持つ。Worker は service role で読み出す。
 *
 * 詳細は docs/planning/free-prompt-private-mode-implementation-plan.md ADR-001。
 *
 * このモジュールは本文をログへ出さない。呼び出し側も、解決後の値を
 * catch したオブジェクトや RPC payload ごと serialize しないこと (REQ-017)。
 */

export interface PromptExecutionRecord {
  snapshotKind: "materialized" | "derived_reference";
  /** 運営が組み立てた開示不可の全文 (one_tap_style)。そのまま provider へ送る */
  providerPrompt: string | null;
  /** 原作者の生入力 (coordinate / free)。Worker が実行時に錨を付ける */
  authorInput: string | null;
  authorInputOwnerId: string | null;
  sourceKind: string | null;
}

/**
 * ジョブに紐づく実行入力を取得する。
 *
 * 移行期間中は実行入力を持たない legacy ジョブが存在するため、
 * 見つからない場合は null を返して呼び出し側の `prompt_text` フォールバックへ
 * 委ねる。Phase 0C で `prompt_text` を空化した後は、呼び出し側が
 * 固定内部コードで fail closed する。
 *
 * DB エラーと「行が無い」を区別する。エラー時に null を返して
 * フォールバックさせると、秘匿境界が障害時に緩む方向へ倒れるため、
 * エラーはそのまま投げる。
 */
export async function resolvePromptExecutionInput(
  // supabase-js の builder 型は generics が深く、構造的な最小型を書くと
  // TS2589 (Type instantiation is excessively deep) で発散する。
  // 同じ理由で prompt-override.ts も any を使っており、書き方を揃える。
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
): Promise<PromptExecutionRecord | null> {
  const { data, error } = await supabase
    .from("generation_prompt_snapshots")
    .select(
      "snapshot_kind, provider_prompt, author_input, author_input_owner_id, source_kind",
    )
    .eq("image_job_id", jobId)
    .maybeSingle();

  if (error) {
    // 本文は載っていないが、念のためメッセージだけに限定して投げる。
    throw new Error(
      `GENERATION_PROMPT_EXECUTION_LOOKUP_FAILED: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  // DB の CHECK 制約で 2 値に限定されているが、型としては string で返るため
  // ここで絞る。想定外の値は移行の不整合なので、握りつぶさず落とす。
  if (
    data.snapshot_kind !== "materialized" &&
    data.snapshot_kind !== "derived_reference"
  ) {
    throw new Error("GENERATION_PROMPT_EXECUTION_INVALID_KIND");
  }

  return {
    snapshotKind: data.snapshot_kind,
    providerPrompt: data.provider_prompt ?? null,
    authorInput: data.author_input ?? null,
    authorInputOwnerId: data.author_input_owner_id ?? null,
    sourceKind: data.source_kind ?? null,
  };
}

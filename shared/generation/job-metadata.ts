/**
 * ジョブの generation_metadata を成功時レコードへ引き継ぐための pure helper。
 *
 * Worker は生成成功時に `geminiAttempts`(試行回数などの実績情報)を追記したうえで、
 * `generated_images.generation_metadata` / `image_jobs.generation_metadata` に保存する。
 * このとき job 側のキー(framingMode / creatorLooksMode / outputAspectRatioMode 等)が
 * 失われないことが重要なため、マージ規則を1箇所に固定してテスト可能にする。
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */

export interface MergeSuccessGenerationMetadataParams {
  /** image_jobs.generation_metadata (ジョブ投入時にAPIが積んだ値)。 */
  jobGenerationMetadata: Record<string, unknown> | null | undefined;
  /** 成功時に追記する実績情報(プロバイダ試行のログ等)。 */
  geminiAttempts: unknown;
}

/**
 * job の generation_metadata を保持したまま geminiAttempts を追記する。
 * job 側が null/undefined でも空オブジェクトから開始し、常に追記結果を返す。
 */
export function mergeSuccessGenerationMetadata({
  jobGenerationMetadata,
  geminiAttempts,
}: MergeSuccessGenerationMetadataParams): Record<string, unknown> {
  return {
    ...(jobGenerationMetadata ?? {}),
    geminiAttempts,
  };
}

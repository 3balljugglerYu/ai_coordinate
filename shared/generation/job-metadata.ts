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
  /**
   * ガチャプロンプトで選ばれた候補（何番が出たか）。本文は秘匿なので番号と
   * 候補数だけを残す。ガチャを使っていない生成ではキーを足さない。
   */
  gachaPicks?: ReadonlyArray<{ number: number; total: number }>;
  /**
   * 名前の欄に名前を入れて生成したか。投稿の「名前入り」の札に使う。
   * ⭐ 名前そのもの(job 側の `nameInput`)は投稿側へ写さない。`generated_images.generation_metadata`
   * は公開の投稿で読めるため(docs/planning/name-input-slot-plan.md 3.4)。
   */
  nameInputUsed?: boolean;
}

/** 名前の欄に入れた名前のキー。job にだけ持ち、成功・確定失敗で消す。 */
export const NAME_INPUT_METADATA_KEY = "nameInput";

/** job の generation_metadata から、名前そのものを取り除く(使ったかどうかは別のキーで残す)。 */
export function stripNameInputFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) => key !== NAME_INPUT_METADATA_KEY),
  );
}

/**
 * job の generation_metadata を保持したまま geminiAttempts を追記する。
 * job 側が null/undefined でも空オブジェクトから開始し、常に追記結果を返す。
 */
export function mergeSuccessGenerationMetadata({
  jobGenerationMetadata,
  geminiAttempts,
  gachaPicks,
  nameInputUsed,
}: MergeSuccessGenerationMetadataParams): Record<string, unknown> {
  return {
    ...stripNameInputFromMetadata(jobGenerationMetadata),
    geminiAttempts,
    ...(gachaPicks && gachaPicks.length > 0 ? { gachaPicks } : {}),
    ...(nameInputUsed ? { nameInputUsed: true } : {}),
  };
}

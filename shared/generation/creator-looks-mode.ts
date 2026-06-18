/**
 * Creator Looks の生成モード。ユーザーが詳細画面で選択する。
 *
 * - "outfit_only"          : 衣装だけ着せる(1回生成)。背景は image_0 のまま。
 * - "outfit_and_background": 衣装＋背景(2段階生成)。段階1で衣装着せ(背景維持)→
 *                            段階2で「段階1の出力＋背景テキスト(image_1なし)」で背景を世界観に変える。
 *                            image_1 の構図が背景にコピーされる問題を回避する。
 * - "background_only"       : 背景だけ世界観に変える(1回生成)。衣装は image_0 のまま。image_1 は渡さない。
 *
 * 本ファイルは pure (ランタイム依存ゼロ) に保ち、client / Next.js handler /
 * Deno worker のすべてから型・導出を共有する。
 *
 * 設計: docs/planning/creator-looks-generation-modes-plan.md
 */

export const CREATOR_LOOKS_MODES = [
  "outfit_only",
  "outfit_and_background",
  "background_only",
] as const;
export type CreatorLooksMode = (typeof CREATOR_LOOKS_MODES)[number];

/** 旧クライアント(モード未指定)互換の既定。背景OFFの衣装着せ=衣装のみ。 */
export const DEFAULT_CREATOR_LOOKS_MODE: CreatorLooksMode = "outfit_only";

/** 外部入力(JSON/metadata)を CreatorLooksMode に解釈する。未知・非文字列は null。 */
export function parseCreatorLooksMode(value: unknown): CreatorLooksMode | null {
  return value === "outfit_only" ||
    value === "outfit_and_background" ||
    value === "background_only"
    ? value
    : null;
}

/** 2段階生成(段階1=衣装→段階2=背景)を要するモードか。 */
export function isTwoStageCreatorLooksMode(mode: CreatorLooksMode): boolean {
  return mode === "outfit_and_background";
}

/** モードの生成段階数(2段階なら2、それ以外は1)。 */
export function maxStagesForCreatorLooksMode(mode: CreatorLooksMode): 1 | 2 {
  return isTwoStageCreatorLooksMode(mode) ? 2 : 1;
}

/**
 * モード → image_jobs の override_outfit / override_background。
 * Creator Looks は angle / pose は常に false(image_0 維持)。
 * - outfit_only          : 衣装ON / 背景OFF
 * - outfit_and_background : 衣装ON / 背景ON (2段階)
 * - background_only       : 衣装OFF / 背景ON (衣装は image_0 のまま)
 */
export function overridesForCreatorLooksMode(mode: CreatorLooksMode): {
  outfit: boolean;
  angle: boolean;
  pose: boolean;
  background: boolean;
} {
  switch (mode) {
    case "outfit_only":
      return { outfit: true, angle: false, pose: false, background: false };
    case "outfit_and_background":
      return { outfit: true, angle: false, pose: false, background: true };
    case "background_only":
      return { outfit: false, angle: false, pose: false, background: true };
  }
}

/**
 * image_jobs.generation_metadata(JSONB) から生成モードを読み取る。
 * キーなし・不正値は null を返す(呼び出し側で override から導出 or 既定適用)。
 * worker(Deno) / Next.js の両方から使う。
 */
export function getCreatorLooksModeFromGenerationMetadata(
  metadata: unknown,
): CreatorLooksMode | null {
  if (typeof metadata === "object" && metadata !== null) {
    return parseCreatorLooksMode(
      (metadata as Record<string, unknown>).creatorLooksMode,
    );
  }
  return null;
}

/**
 * override_outfit / override_background からモードを逆引きする(metadata 欠落時のフォールバック)。
 * 旧 inspire(Creator Looks)ジョブは metadata に mode を持たないため、override から判定する。
 */
export function creatorLooksModeFromOverrides(
  overrideOutfit: boolean,
  overrideBackground: boolean,
): CreatorLooksMode {
  if (!overrideOutfit && overrideBackground) return "background_only";
  if (overrideOutfit && overrideBackground) return "outfit_and_background";
  return "outfit_only";
}

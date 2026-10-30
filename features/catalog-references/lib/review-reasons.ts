/**
 * 見本つきの作品の審査の、作り直しの理由の分類。
 * generated_image_catalog_reviews.reason_category の CHECK と同じにすること。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 4)
 */
export const CATALOG_REVIEW_REASON_CATEGORIES = [
  "official_or_others_work",
  "real_person",
  "sexual_or_violent",
  "other",
] as const;

export type CatalogReviewReasonCategory = (typeof CATALOG_REVIEW_REASON_CATEGORIES)[number];

/** 作者への説明の上限(DB の char_length と同じく、文字の数で数える) */
export const CATALOG_REVIEW_REASON_MAX_CHARS = 500;

export function catalogReviewReasonLength(reason: string): number {
  return Array.from(reason).length;
}

/** 「そのほか」は分類だけでは何を直せばよいか伝わらないので、説明を必須にする */
export function catalogReviewReasonRequired(category: CatalogReviewReasonCategory): boolean {
  return category === "other";
}

/** 運営の画面での呼び名 */
export const CATALOG_REVIEW_REASON_LABELS: Record<CatalogReviewReasonCategory, string> = {
  official_or_others_work: "公式の作品・ほかの人の作品",
  real_person: "実在の人物",
  sexual_or_violent: "性的・暴力的な表現",
  other: "そのほか(説明に書く)",
};

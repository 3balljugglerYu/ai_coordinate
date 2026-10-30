/**
 * 見本(参照画像)つきのカタログで、見本からまねるもの。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・ADR-007)
 *
 * 値は image_jobs.catalog_reference_takes の CHECK(outfit / pose / angle / background・1〜4個・重複なし)と
 * 同じにすること。並びは Inspire の指示文と同じ(衣装 → アングル → ポーズ → 背景)。
 */
export const CATALOG_REFERENCE_TAKES = ["outfit", "angle", "pose", "background"] as const;

export type CatalogReferenceTake = (typeof CATALOG_REFERENCE_TAKES)[number];
